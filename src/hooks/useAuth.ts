'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AppUser {
  id:    number;
  email: string;
  name:  string;
  role:  'admin' | 'reviewer';
}

export function useAuth(requiredRole?: 'admin' | 'reviewer') {
  const [user, setUser]   = useState<AppUser | null>(null);
  const [token, setToken] = useState<string>('');
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token') || '';
    const storedUser  = localStorage.getItem('user');

    if (!storedToken || !storedUser) {
      router.push('/login');
      return;
    }

    try {
      const parsed = JSON.parse(storedUser) as AppUser;
      if (requiredRole && parsed.role !== requiredRole && !(requiredRole === 'reviewer' && parsed.role === 'admin')) {
        router.push('/login');
        return;
      }
      setToken(storedToken);
      setUser(parsed);
    } catch {
      router.push('/login');
      return;
    }
    setReady(true);
  }, []);

  return { user, token, ready };
}
