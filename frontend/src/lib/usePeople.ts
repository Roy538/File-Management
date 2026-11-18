import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import { useSession } from '@/features/auth/session';

interface Person { id: string; fullName: string; active: boolean }

/**
 * Display names for the user ids on a screen, fetched in one request and cached. Returns a
 * function that names an id: "you" for the caller, the person's name, or null while loading /
 * if the id isn't in the caller's organisation.
 */
export function usePeople(ids: Array<string | null | undefined>) {
  const me = useSession((s) => s.user?.id);
  const wanted = [...new Set(ids.filter((i): i is string => !!i && i !== me))].sort().slice(0, 100);
  const { data } = useQuery({
    queryKey: ['people', wanted],
    queryFn: () => api.get<Person[]>('/directory/people', { ids: wanted.join(',') }),
    enabled: wanted.length > 0,
    staleTime: 10 * 60_000,
  });
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  return (id: string | null | undefined, opts?: { you?: string }): string | null => {
    if (!id) return null;
    if (id === me) return opts?.you ?? 'you';
    const p = byId.get(id);
    return p ? (p.active ? p.fullName : `${p.fullName} (former user)`) : null;
  };
}
