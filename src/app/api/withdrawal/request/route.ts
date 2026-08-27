// src/app/api/withdrawal/request/route.ts
import { NextResponse } from 'next/server';
// WITHDRAWALS DISABLED — see Task 21. Imports for the original logic
// kept commented, not deleted, alongside the handler body below.
// import { createServerClient } from '@supabase/ssr';
// import { cookies } from 'next/headers';

// WITHDRAWALS DISABLED — see Task 21. No withdrawal functionality is
// user-facing right now; this endpoint intentionally short-circuits
// and returns a disabled response instead of processing a request.
// The original handler is preserved below, commented out, so it can
// be restored later without reconstructing it from git history alone.
export async function POST(request: Request) {
  return NextResponse.json(
    { error: 'Withdrawals are temporarily disabled.' },
    { status: 403 }
  );
}

// export async function POST(request: Request) {
//   try {
//     const { userId, amount, method, accountDetails } = await request.json();
//
//     if (!userId || !amount || !method) {
//       return NextResponse.json(
//         { error: 'User ID, amount, and method are required' },
//         { status: 400 }
//       );
//     }
//
//     if (amount <= 0) {
//       return NextResponse.json(
//         { error: 'Amount must be greater than 0' },
//         { status: 400 }
//       );
//     }
//
//     const cookieStore = cookies();
//     const supabase = createServerClient(
//       process.env.NEXT_PUBLIC_SUPABASE_URL!,
//       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//       {
//         cookies: {
//           get(name: string) {
//             return cookieStore.get(name)?.value;
//           },
//           set(name: string, value: string, options: any) {
//             cookieStore.set({ name, value, ...options });
//           },
//           remove(name: string, options: any) {
//             cookieStore.set({ name, value: '', ...options });
//           },
//         },
//       }
//     );
//
//     // Get user's current points and wallet
//     const { data: user, error: userError } = await supabase
//       .from('users')
//       .select('points, wallet')
//       .eq('id', userId)
//       .single();
//
//     if (userError || !user) {
//       console.error('User not found:', userError);
//       return NextResponse.json(
//         { error: 'User not found' },
//         { status: 404 }
//       );
//     }
//
//     // Calculate points required (100 points = 1 unit of currency)
//     const pointsMultiplier = 100;
//     const pointsRequired = amount * pointsMultiplier;
//     const currentPoints = user?.points || 0;
//
//     // Check if user has enough points
//     if (currentPoints < pointsRequired) {
//       return NextResponse.json(
//         {
//           error: 'Insufficient points',
//           required: pointsRequired,
//           available: currentPoints,
//         },
//         { status: 400 }
//       );
//     }
//
//     // Check for existing pending withdrawal
//     const { data: existingRequest, error: existingError } = await supabase
//       .from('withdrawals')
//       .select('id, status')
//       .eq('user_id', userId)
//       .eq('status', 'pending')
//       .single();
//
//     if (existingRequest) {
//       return NextResponse.json(
//         { error: 'You already have a pending withdrawal request' },
//         { status: 400 }
//       );
//     }
//
//     // Create withdrawal request
//     const { data: withdrawal, error: insertError } = await supabase
//       .from('withdrawals')
//       .insert({
//         user_id: userId,
//         amount: amount,
//         points_amount: pointsRequired,
//         method: method,
//         account_details: accountDetails || {},
//         status: 'pending',
//         created_at: new Date().toISOString(),
//       })
//       .select()
//       .single();
//
//     if (insertError) {
//       console.error('Error creating withdrawal:', insertError);
//       return NextResponse.json(
//         { error: 'Failed to create withdrawal request' },
//         { status: 500 }
//       );
//     }
//
//     // Update user's points and wallet
//     const currentWalletBalance = user?.wallet?.balance || 0;
//     const currentPendingWithdrawal = user?.wallet?.pending_withdrawal || 0;
//
//     const { error: updateError } = await supabase
//       .from('users')
//       .update({
//         points: currentPoints - pointsRequired,
//         wallet: {
//           balance: currentWalletBalance - amount,
//           pending_withdrawal: currentPendingWithdrawal + amount,
//         },
//       })
//       .eq('id', userId);
//
//     if (updateError) {
//       console.error('Error updating user:', updateError);
//       // Rollback: delete the withdrawal request
//       await supabase
//         .from('withdrawals')
//         .delete()
//         .eq('id', withdrawal.id);
//
//       return NextResponse.json(
//         { error: 'Failed to update user balance' },
//         { status: 500 }
//       );
//     }
//
//     // Create notification
//     await supabase.from('notifications').insert({
//       user_id: userId,
//       type: 'withdrawal_requested',
//       content: {
//         text: `💰 Withdrawal request of ${amount} units (${pointsRequired} points) submitted. Waiting for approval.`,
//         amount: amount,
//         points: pointsRequired,
//         status: 'pending',
//       },
//       created_at: new Date().toISOString(),
//     });
//
//     // Add points history entry
//     await supabase.from('points_history').insert({
//       user_id: userId,
//       amount: -pointsRequired,
//       type: 'withdrawal',
//       description: `Withdrawal request: ${amount} units via ${method}`,
//       created_at: new Date().toISOString(),
//     });
//
//     return NextResponse.json({
//       success: true,
//       message: 'Withdrawal request submitted successfully',
//       withdrawal: {
//         id: withdrawal.id,
//         amount: withdrawal.amount,
//         pointsAmount: withdrawal.points_amount,
//         method: withdrawal.method,
//         status: withdrawal.status,
//         createdAt: withdrawal.created_at,
//       },
//     });
//
//   } catch (error) {
//     console.error('Withdrawal request error:', error);
//     return NextResponse.json(
//       { error: 'Failed to process withdrawal request' },
//       { status: 500 }
//     );
//   }
// }
