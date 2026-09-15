import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setTokens, clearTokens } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  branchId: string;
  businessUnitId: string;
}

interface LoginDto {
  email: string;
  password: string;
  branchId?: string;
  businessUnitId?: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (dto: LoginDto) => Promise<void>;
  logout: () => Promise<void>;
  devLogin: () => void;
}

const DEV_BYPASS_KEY = 'fts_dev_bypass';

const DEV_USER: AuthUser = {
  id: 'dev-admin-001',
  email: 'admin@fts.local',
  role: 'ADMIN',
  branchId: 'dev-branch-001',
  businessUnitId: 'dev-bu-001',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Dev bypass: skip all API calls and use a mock admin user
    if (localStorage.getItem(DEV_BYPASS_KEY) === 'true') {
      setUser(DEV_USER);
      setIsLoading(false);
      return;
    }

    const storedUser = localStorage.getItem('user');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!storedUser || !refreshToken) {
      setIsLoading(false);
      return;
    }

    try {
      setUser(JSON.parse(storedUser));
    } catch {
      localStorage.removeItem('user');
    }

    api.post<TokenResponse>('/api/auth/refresh', { refreshToken })
      .then(data => {
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (dto: LoginDto) => {
    const data = await api.post<TokenResponse>('/api/auth/login', dto);
    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const devLogin = () => {
    localStorage.setItem(DEV_BYPASS_KEY, 'true');
    setUser(DEV_USER);
  };

  const logout = async () => {
    localStorage.removeItem(DEV_BYPASS_KEY);
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await api.post('/api/auth/logout', { refreshToken }).catch(() => {});
    }
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, devLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
