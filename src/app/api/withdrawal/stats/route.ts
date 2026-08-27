// src/app/api/withdrawal/stats/route.ts
//
// TASK 21 AUDIT NOTE: grepped the entire `src` tree for any call to
// this endpoint (`withdrawal/stats`) — none found. It's not wired
// into any page or component today, so it isn't part of the
// user-facing withdrawal surface Task 21 asks to disable, and it's
// read-only (returns numbers, doesn't move funds or create a
// withdrawal), so leaving it live poses no withdrawal-action risk.
// Left untouched rather than commented out to avoid churning working,
// unreferenced code — revisit if/when something starts calling it.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
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

    // Get user's points and wallet
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('points, wallet')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's rank from leaderboard
    const { data: rankData, error: rankError } = await supabase
      .from('leaderboard_record')
      .select('owner_id, score')
      .order('score', { ascending: false });

    if (rankError) {
      console.error('Error fetching leaderboard:', rankError);
    }

    // Calculate rank (1-based index)
    let rank = 0;
    if (rankData) {
      const userIndex = rankData.findIndex(r => r.owner_id === userId);
      rank = userIndex !== -1 ? userIndex + 1 : rankData.length + 1;
    }

    // Calculate withdrawal stats
    const pointsMultiplier = 100;
    const totalPoints = user?.points || 0;
    const totalEarned = totalPoints / pointsMultiplier;
    const pendingWithdrawal = user?.wallet?.pending_withdrawal || 0;
    const availableForWithdrawal = Math.max(0, totalEarned - pendingWithdrawal);
    const withdrawnTotal = user?.wallet?.withdrawn_total || 0;
    const totalUsers = rankData?.length || 0;

    // Get withdrawal history stats
    const { data: withdrawalHistory, error: historyError } = await supabase
      .from('withdrawals')
      .select('status, amount')
      .eq('user_id', userId);

    if (historyError) {
      console.error('Error fetching withdrawal history:', historyError);
    }

    // Calculate stats from withdrawal history
    let totalWithdrawn = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    if (withdrawalHistory) {
      for (const w of withdrawalHistory) {
        if (w.status === 'completed' || w.status === 'approved') {
          totalWithdrawn += w.amount;
          approvedCount++;
        } else if (w.status === 'pending') {
          pendingCount++;
        } else if (w.status === 'rejected') {
          rejectedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalPoints: totalPoints,
        totalEarned: totalEarned,
        availableForWithdrawal: availableForWithdrawal,
        withdrawnTotal: withdrawnTotal,
        rank: rank,
        totalUsers: totalUsers,
        pendingWithdrawal: pendingWithdrawal,
        withdrawalCount: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
        pointsMultiplier: pointsMultiplier,
      },
    });
    
  } catch (error) {
    console.error('Withdrawal stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
