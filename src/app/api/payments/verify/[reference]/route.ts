import { NextRequest, NextResponse } from 'next/server';
import { getChargeStatus } from '@/services/payment/korapay.service';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

/**
 * GET /api/payments/verify/{reference}
 * Checks charge status and credits wallet if successful
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reference } = params;
    const result = await getChargeStatus(reference);

    if (result.data.status === 'successful') {
      // Check if already credited
      const { data: existing } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', user.id)
        .ilike('description', `%${reference}%`)
        .gt('amount_cents', 0)
        .single();

      if (!existing) {
        // Credit wallet
        await supabase.from('wallet_ledger').insert({
          user_id: user.id,
          amount_cents: result.data.amount,
          type: 'bonus',
          description: `Wallet top-up: ${reference}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: result.data.status,
      amount: result.data.amount,
      currency: result.data.currency,
    });
  } catch (err: any) {
    console.error('Payment verify error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
