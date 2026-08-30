// src/app/api/auth/create-user/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );
    
    const generatedPassword = `sw_${Math.random().toString(36).substring(2, 10)}`;
    
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: generatedPassword,
      options: {
        emailRedirectTo: request.headers.get('origin') || '',
        data: { email_confirmed: true }
      }
    });

    if (signUpError) throw signUpError;

    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: authData.user?.id,
        email: email,
        points: 0,
        streak: 0,
        tier: 'T4',
        role: 'artist', // Task 48 (handover.md), Part 1 of 3 — product owner
        // confirmed directly: every new signup gets the 'artist' role now.
        // 'listener' is reserved for a distinct, not-yet-built future
        // feature (a separate "listen and get paid" flow, entered via an
        // occasional banner prompt, its own UI/architecture still being
        // designed) — it is NOT the default for new users anymore, and
        // this change does not add any code path that assigns it. Tier
        // ('T4') and points (0) stay exactly as they were — the product
        // owner's answer was specifically "just swap the role," no
        // different starting tier/points baseline for an artist vs. what
        // a listener used to start at.
        is_active: false,
        user_type: 'real',
        wallet: { balance: 0 },
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}