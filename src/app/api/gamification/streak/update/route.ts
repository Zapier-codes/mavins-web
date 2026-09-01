// src/app/api/gamification/streak/update/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }
    
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
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('streak, last_active')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = new Date().toISOString().split('T')[0];
    const lastActive = user?.last_active?.split('T')[0];
    let newStreak = user?.streak || 0;

    // If already active today, return current streak
    if (lastActive === today) {
      return NextResponse.json({ streak: newStreak });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Update streak based on last active date
    if (lastActive === yesterdayStr) {
      newStreak++;
    } else {
      newStreak = 1;
    }

    // Update user streak
    const { error: updateError } = await supabase
      .from('users')
      .update({
        streak: newStreak,
        last_active: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating streak:', updateError);
      return NextResponse.json({ error: 'Failed to update streak' }, { status: 500 });
    }

    // Check for streak milestones
    const streakMilestones = [7, 14, 30, 60, 100];
    const bonusPoints: Record<number, number> = { 
      7: 100, 
      14: 250, 
      30: 500, 
      60: 1000, 
      100: 2500 
    };

    if (streakMilestones.includes(newStreak)) {
      // Migration 026 (handover.md, Task 48-d Part 1's flagged gap):
      // award_points is locked to service_role only, same posture as
      // every other points/wallet-mutating RPC in this project
      // (credit_wallet_deposit, debit_wallet_balance,
      // credit_wallet_refund) — this route's own `supabase` client
      // above is anon-key, which that lockdown would reject outright.
      // Admin client used for ONLY this one call, not swapped in for
      // the rest of this route's already-working anon-key reads/
      // writes above (streak read/update, the notification insert
      // below) — narrowest fix for the actual mismatch, not a reason
      // to revisit this route's other RLS-governed behavior.
      const admin = createAdminClient();
      const { error: rpcError } = await admin.rpc('award_points', {
        p_user_id: userId,
        p_points: bonusPoints[newStreak],
        p_reason: `${newStreak} day streak milestone!`,
      });

      if (rpcError) {
        console.error('Error awarding bonus points:', rpcError);
      } else {
        // Insert notification
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'milestone',
          content: { 
            text: `🔥 ${newStreak} day streak! You earned ${bonusPoints[newStreak]} bonus points!` 
          },
          created_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      streak: newStreak,
      milestone: streakMilestones.includes(newStreak) ? bonusPoints[newStreak] : null
    });
  } catch (error) {
    console.error('Streak update error:', error);
    return NextResponse.json({ error: 'Failed to update streak' }, { status: 500 });
  }
}
