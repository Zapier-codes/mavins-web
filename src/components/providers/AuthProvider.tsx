'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  signOut: async () => {},
});

const SESSION_KEY = 'mavins_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      // 1. Try Supabase session first
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        const merged = { ...session.user, ...profile };
        setUser(merged);
        // Persist to localStorage for cross-session recovery
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user_id: session.user.id,
          }));
        } catch {}
      } else {
        // 2. Fallback: try localStorage recovery
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        supabase.from('users').select('*').eq('id', session.user.id).single().then(({ data }) => {
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
