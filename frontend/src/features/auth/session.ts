import { create } from 'zustand';
import { api, refreshSession, tokens, type SessionPayload } from '@/lib/api/client';
import type { UserProfile } from '@/lib/api/types';

/**
 * Who is signed in. The access token stays inside the API client; this store only holds the
 * profile the UI renders from. "booting" covers the silent refresh on page load.
 */
interface SessionState {
  status: 'booting' | 'signedOut' | 'signedIn';
  user: UserProfile | null;
  /** Shown on the sign-in screen after an involuntary sign-out. */
  notice: string | null;
  bootstrap: () => Promise<void>;
  signIn: (organisation: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  expire: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  user: null,
  notice: null,

  async bootstrap() {
    const session = await refreshSession();
    set(session ? { status: 'signedIn', user: session.user } : { status: 'signedOut', user: null });
  },

  async signIn(organisation, email, password) {
    const session = await api.post<SessionPayload>('/auth/login', { organisation, email, password });
    tokens.set(session.accessToken);
    set({ status: 'signedIn', user: session.user, notice: null });
  },

  async signOut() {
    try {
      await api.post('/auth/logout');
    } finally {
      tokens.set(null);
      set({ status: 'signedOut', user: null, notice: null });
    }
  },

  expire() {
    tokens.set(null);
    set({ status: 'signedOut', user: null, notice: 'Your session ended. Sign in again to continue.' });
  },
}));

tokens.onExpired(() => useSession.getState().expire());

/** Capability check for showing or hiding UI. The server enforces every one of these. */
export function useCan(code: string): boolean {
  return useSession((s) => s.user?.permissions.includes(code) ?? false);
}
