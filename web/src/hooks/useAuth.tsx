'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, User, setToken, clearToken } from '@/lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('vaultline_token');
    const storedUser = localStorage.getItem('vaultline_user');
    if (storedToken && storedUser) {
      setTokenState(storedToken);
      try { setUser(JSON.parse(storedUser)); } catch { clearToken(); }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setToken(res.accessToken);
    localStorage.setItem('vaultline_user', JSON.stringify(res.user));
    setTokenState(res.accessToken);
    setUser(res.user);
  };

  const register = async (email: string, password: string, fullName: string) => {
    await authApi.register(email, password, fullName);
    await login(email, password);
  };

  const logout = async () => {
    try {
      const rt = localStorage.getItem('vaultline_refresh_token');
      if (rt) await authApi.logout(rt);
    } catch { /* ignore */ }
    clearToken();
    setUser(null);
    setTokenState(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
