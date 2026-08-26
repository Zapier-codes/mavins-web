'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

/** Hardcoded admin credentials — the single source of truth. */
export const ADMIN_CONFIG = {
  email: 'bossblingzs@gmail.com',
  password: '$Password7492',
} as const;

/** Check if a user is admin by DB role OR hardcoded email fallback. */
export function isAdmin(user: any): boolean {
  if (!user) return false;
  // DB role takes priority
  if (user.role === 'admin') return true;
  // Fallback to hardcoded email for the config admin
  return user.email?.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim();
}

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,
  signOut: async () => {},
});

const SESSION_KEY = 'mavins_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        const merged = { ...session.user, ...profile };
        setUser(merged);
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user_id: session.user.id,
          }));
        } catch {}
      } else {
        try {
          const saved = localStorage.getItem(SESSION_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.access_token && parsed.refresh_token) {
              const { data, error } = await supabase.auth.setSession({
                access_token: parsed.access_token,
                refresh_token: parsed.refresh_token,
              });
              if (!error && data.session?.user) {
                const { data: profile } = await supabase
                  .from('users')
                  .select('*')
                  .eq('id', data.session.user.id)
                  .single();
                setUser({ ...data.session.user, ...profile });
              } else {
                localStorage.removeItem(SESSION_KEY);
              }
            }
          }
        } catch {}
      }
      setIsLoading(false);
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (session?.user) {
        supabase.from('users').select('*').eq('id', session.user.id).single().then(({ data }: { data: any }) => {
          setUser({ ...session.user, ...data });
        });
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user_id: session.user.id,
          }));
        } catch {}
      } else {
        setUser(null);
        try { localStorage.removeItem(SESSION_KEY); } catch {}
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!user, 
      isAdmin: isAdmin(user),
      isLoading, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
