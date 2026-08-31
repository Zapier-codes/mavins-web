import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/payments/campaign-intent/[reference]
 *
 * Task 61 (handover.md, formalizing "Task 36 Part 4"). The last piece
 * of the reference-threading fix: `verify/[reference]/route.ts` now
 * appends `?reference=` onto its own success redirect, so
 * `promote/page.tsx` has it available when it lands back on
 * `/promote?campaign_created=1&reference=...`. This route is what
 * that page calls with it — a pure read of
 * `payment_sessions.metadata.campaign.targetCountries`, the same
 * snapshot Part 2's webhook handler already reads from to actually
 * build the campaign (see `initialize-campaign/route.ts`'s own header
 * comment) — this route doesn't add a new source of truth, it exposes
 * a read of the one that already exists.
 *
 * No auth check beyond knowing the reference itself — same posture as
 * `verify/[reference]/route.ts` right next to it: the reference is an
 * unguessable server-generated token, not a user-suppliable id, so
 * knowing it is already the capability this route relies on, same as
 * every other route in this payment-session family.
 *
 * Deliberately narrow: returns only `targetCountries` (a string
 * array), not the full `metadata.campaign` object or any other
 * `payment_sessions` column — the guest success screen has exactly
 * one use for this data (`CampaignSuccessVisualization`'s own prop),
 * and a narrower response is both simpler to consume and leaks less
 * of this table's own shape to the client than a full-row read would.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { reference: string } }
) {
  const reference = params.reference;

  try {
    const supabase = createAdminClient();

    const { data: session, error } = await supabase
      .from('payment_sessions')
      .select('metadata')
      .eq('reference', reference)
      .maybeSingle();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!session) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const targetCountries = session.metadata?.campaign?.targetCountries;
    return NextResponse.json({
      success: true,
      targetCountries: Array.isArray(targetCountries) ? targetCountries : [],
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status: 500 });
  }
}
