import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const bootstrapSession = async () => {
      try {
        const res = await fetch('/api/auth/me');

        if (!res.ok) throw new Error('Invalid session');

        const data = await res.json() as { user: User };
        if (isActive) setUser(data.user);
      } catch {
        if (isActive) {
          setUser(null);
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void bootstrapSession();

    return () => {
      isActive = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }

    const data = await res.json();
    setUser(data.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }

    const data = await res.json();
    setUser(data.user);
  };

  const logout = () => {
    void fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useApi() {
  const { logout } = useAuth();

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, options);

    if (res.status === 401) {
      const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });

      if (!refreshRes.ok) {
        logout();
        throw new Error('Session expired');
      }

      await refreshRes.json() as { user?: { id: string; email: string; name: string | null } };

      const retryRes = await fetch(url, options);

      if (retryRes.status === 401) {
        logout();
        throw new Error('Session expired');
      }

      return retryRes;
    }

    return res;
  };

  return apiFetch;
}
