import { NextRequest, NextResponse } from 'next/server';
import { verifyCharge } from '@/services/payment/korapay.service';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

/**
 * GET /api/payments/verify/{reference}
 * Checks the status of a Korapay charge and credits wallet if successful.
 * Called by the client after redirect from Korapay checkout.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  try {
    const { reference } = params;
    if (!reference) {
      return NextResponse.json({ error: 'Reference required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify with Korapay
    const result = await verifyCharge(reference);

    if (result.data.status === 'successful') {
      // Check idempotency
      const { data: existing } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', user.id)
        .ilike('description', `%${reference}%`)
        .gt('amount_cents', 0)
        .single();

      if (!existing) {
        await supabase.from('wallet_ledger').insert({
          user_id: user.id,
          amount_cents: result.data.amount,
          type: 'bonus',
          description: `Wallet top-up via ${result.data.payment_method || 'korapay'}: ${reference}`,
        });
      }

      return NextResponse.json({
        success: true,
        status: result.data.status,
        amount: result.data.amount,
        reference: result.data.reference,
      });
    }

    return NextResponse.json({
      success: false,
      status: result.data.status,
      reference: result.data.reference,
    });
  } catch (err: any) {
    console.error('Payment verify error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
