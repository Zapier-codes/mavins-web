// src/app/admin/layout.tsx
//
// Task 46d (handover.md): "route-level isAdmin() gating consistent
// with how api/admin/dashboard/route.ts already does it (check the
// caller's own session, not just trust a client-side isAdmin() check,
// which is trivially bypassable from devtools)."
//
// This is a Server Component (no 'use client') specifically so this
// check runs on the server, before any admin page's markup — including
// its loading skeleton — ever reaches a non-admin's browser. The old
// monolithic admin/page.tsx's own gating (`if (!isAuthenticated ||
// !isAdmin) router.push('/')`) ran client-side, in a useEffect, after
// first paint — a non-admin briefly saw the page shell (and every
// route's own client-side data-fetching calls still went through
// requireAdmin()-gated API routes regardless, so no data ever actually
// leaked) before being redirected away. This closes that gap: the
// redirect now happens before the page is served at all.
//
// Deliberately NOT reusing requireAdmin() (src/lib/auth/requireAdmin.ts)
// as-is — that helper returns a NextResponse for its failure case,
// shaped for Route Handlers, not layouts (which should call redirect()
// instead of returning a Response object). Small parallel check here
// instead, using the same two underlying primitives
// (createServerSupabaseClient, isAdmin) rather than shoehorning a
// Route-Handler-shaped return into a layout's different consumption
// context. No service-role client is needed here at all — this layout
// only decides redirect-or-render; every real data read/write still
// goes through its own requireAdmin()-gated API route, unchanged from
// before this task.

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/isAdmin';
import { AdminNav } from './AdminNav';
import { Shield } from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/');
  }

  // RLS's "own row" policy permits this — a user can always read their
  // own `role`, same as requireAdmin()'s own equivalent read.
  const { data: profile } = await supabase.from('users').select('role').eq('id', authUser.id).single();

  const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });
  if (!callerIsAdmin) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-[#1db954]" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-[var(--muted-foreground)] text-sm">Platform health and management</p>
          </div>
        </div>

        <AdminNav />

        {children}
      </div>
    </div>
  );
}
