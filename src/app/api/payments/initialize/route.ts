import { NextRequest, NextResponse } from 'next/server';
import { initializeCharge } from '@/services/payment/korapay.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/payments/initialize
 * Body: { amount: number, currency?: string }
 * Creates a Korapay checkout session for wallet top-up
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, currency = 'NGN' } = body;

    if (!amount || amount < 100) {
      return NextResponse.json({ error: 'Minimum amount is 100 NGN' }, { status: 400 });
    }

    // Get user profile for name
    const { data: profile } = await supabase
      .from('users')
      .select('artist_name, email')
      .eq('id', user.id)
      .single();

    const reference = `WLT-${user.id.slice(0, 8)}-${Date.now()}`;

    const result = await initializeCharge({
      amount,
      currency,
      reference,
      customerEmail: profile?.email || user.email!,
      customerName: profile?.artist_name || 'Mavins User',
      metadata: {
        user_id: user.id,
        type: 'wallet_topup',
        description: 'Mavins Wallet Top-up',
      },
    });

    // Store pending transaction
    await supabase.from('wallet_ledger').insert({
      user_id: user.id,
      amount_cents: 0, // Will be updated on webhook confirmation
      type: 'bonus',
      description: `Pending top-up: ${reference}`,
    });

    return NextResponse.json({
      success: true,
      checkout_url: result.data.checkout_url,
      reference: result.data.reference,
    });
  } catch (err: any) {
    console.error('Payment initialize error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to initialize payment' },
      { status: 500 }
    );
  }
}
