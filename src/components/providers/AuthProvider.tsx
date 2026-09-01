'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isAdmin, ADMIN_CONFIG } from '@/lib/auth/isAdmin';

// Re-exported for existing importers (e.g. the admin login page) — the
// actual logic now lives in src/lib/auth/isAdmin.ts so server-only code
// (API routes) can use the same single source of truth without pulling in
// this 'use client' module's boundary.
export { isAdmin, ADMIN_CONFIG };

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

// Task 48-d Part 1 (handover.md) — wires the previously-unwired
// POST /api/gamification/streak/update into the app. Confirmed via
// grep before starting: this endpoint (and the other four
// gamification routes) had zero call sites anywhere in the frontend —
// fully built, functionally complete, never actually invoked. This is
// the ONLY one of the five wired this session, per this project's own
// new mandatory task-splitting rule (see this file's "Build-focus +
// mandatory task-splitting" section near the top) — tasks/update,
// tasks/claim, points/history, and tier/check remain unwired, left for
// separate future parts (48-d Part 2 onward), not attempted here.
//
// Fire-once-per-user-session guard: the route itself is already
// idempotent server-side (returns the current streak unchanged if
// `last_active` is already today, see that file's own early-return) —
// this ref just avoids firing a redundant network request on every
// re-render once a user is already loaded, not a correctness
// requirement.
function useStreakUpdateOnLogin(userId: string | null | undefined) {
  const firedForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || firedForUserId.current === userId) return;
    firedForUserId.current = userId;

    fetch('/api/gamification/streak/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).catch((err) => {
      // Non-fatal by design — a failed streak update should never
      // block or visibly disrupt anything else in the app. Reset the
      // guard so a later re-render (e.g. after a transient network
      // failure) can retry for this same user.
      console.error('Streak update failed:', err);
      firedForUserId.current = null;
    });
  }, [userId]);
}

// Task 48-d Part 5a (handover.md) — wires the previously-unwired
// POST /api/gamification/tier/check into the app, same pattern as
// Part 1's streak hook directly above. Picked over Part 2
// (tasks/update) as this session's actual next part: Part 2 depends
// on the `daily_tasks` catalog, a table that exists live but isn't in
// any tracked migration/schema file in this repo (confirmed via grep,
// same untracked-table pattern this project has hit before) and has
// zero existing frontend surface of any kind to hang a trigger off
// of — genuinely blocked on missing information, not something to
// force a guess at. tier/check has neither problem: it's a pure
// function of `users.points` (already known) with the exact same
// "fires once per session, safe to no-op" shape Part 1 already
// proved out.
//
// Split into 5a/5b per this session's own mandatory task-splitting
// rule: 5a (this) is the mechanical wiring — call the endpoint, let
// its own existing server-side effects (notification + migration_card
// insert on a real tier change, both already built) do the
// user-facing work. 5b (explicitly NOT started here) would be a
// dedicated tier-status UI surface (current tier, points to next
// tier, multiplier) — nothing in the app displays that today even
// though `tier/check`'s response already returns all of it; that's a
// real, separate piece of work, not bundled into this wiring pass.
function useTierCheckOnLogin(userId: string | null | undefined) {
  const firedForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || firedForUserId.current === userId) return;
    firedForUserId.current = userId;

    fetch('/api/gamification/tier/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).catch((err) => {
      // Same non-fatal, reset-and-allow-retry posture as the streak
      // hook above — a failed tier check should never block or
      // visibly disrupt anything else in the app.
      console.error('Tier check failed:', err);
      firedForUserId.current = null;
    });
  }, [userId]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useStreakUpdateOnLogin(user?.id);
  useTierCheckOnLogin(user?.id);

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
