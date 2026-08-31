import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';
import { calculatePricing } from '@/lib/campaign/pricing';
import { getServerReferenceData } from '@/lib/campaign/referenceDataCache';

interface CreateCampaignBody {
  sourceUrl: string;
  viewCount: number;
  genre?: string;
  geographicTier?: string;
  targetCountries?: string[];
  skipMetrics?: boolean;
}

async function debitWalletForCampaign(admin: any, userId: string, amountCents: number, reference: string) {
  const { data, error } = await admin.rpc('debit_wallet_balance', {
    p_user_id: userId, p_amount_cents: amountCents, p_reference: reference, p_reason: 'campaign_placement',
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { debited: !!row?.debited, newBalanceCents: row?.new_balance_cents ?? 0, errorCode: row?.error_code ?? null };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated', code: 'GUEST_USE_DIRECT_PAY' }, { status: 401 });
    }

    const body: CreateCampaignBody = await request.json();
    if (!body?.sourceUrl || !body?.viewCount) {
      return NextResponse.json({ success: false, error: 'sourceUrl and viewCount are required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin.from('users').select('role').eq('id', authUser.id).single();
    const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });

    const referenceData = await getServerReferenceData(admin);
    const pricing = calculatePricing(body.viewCount, referenceData);

    const { data: existingActive } = await admin
      .from('track_campaigns').select('id, current_stage, total_budget_cents, spent_cents')
      .eq('artist_id', authUser.id).eq('source_url', body.sourceUrl).eq('is_active', true)
      .limit(1).maybeSingle();

    if (existingActive) {
      return NextResponse.json({ success: false, error: 'Active campaign already exists for this link.', existingCampaign: existingActive }, { status: 400 });
    }

    const debitReference = crypto.randomUUID();
    if (!callerIsAdmin) {
      const debitResult = await debitWalletForCampaign(admin, authUser.id, pricing.totalCostCents, debitReference);
      if (!debitResult.debited) {
        return NextResponse.json({ success: false, error: 'Insufficient wallet balance.' }, { status: 400 });
      }
    }

    // Admin can toggle skip_metrics; regular users always purchase metrics
    const skipMetrics = callerIsAdmin ? (body.skipMetrics ?? false) : false;

    const { data, error } = await admin.from('track_campaigns').insert({
      source_url: body.sourceUrl,
      artist_id: authUser.id,
      total_budget_cents: callerIsAdmin ? 0 : pricing.totalCostCents,
      spent_cents: 0,
      geographic_tier: body.geographicTier || 'local',
      target_countries: body.targetCountries || [],
      target_genres: body.genre ? [body.genre] : [],
      current_stage: 'planting',
      is_active: true,
      is_paused: false,
      total_streams: 0,
      target_view_count: pricing.viewCount,
      estimated_duration_days: pricing.durationSlot.days,
      skip_metrics: skipMetrics,
    }).select('id').single();

    if (error) {
      if (!callerIsAdmin) {
        await admin.rpc('credit_wallet_refund', {
          p_user_id: authUser.id, p_amount_cents: pricing.totalCostCents,
          p_reference: debitReference, p_reason: 'campaign_create_failed',
        });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Initialize growth budget record (only if not skipping metrics)
    if (!skipMetrics) {
      const growthCents = Math.floor(pricing.totalCostCents * 0.5);
      const reserveCents = Math.floor(growthCents * 0.05);
      const spendableCents = growthCents - reserveCents;
      const dailyBudget = Math.floor(spendableCents / pricing.durationSlot.days);

      await admin.from('campaign_growth_budgets').insert({
        campaign_id: data.id,
        total_growth_cents: growthCents,
        reserve_cents: reserveCents,
        spendable_cents: spendableCents,
        daily_budget_cents: dailyBudget,
        remaining_cents: spendableCents,
      });
    }

    return NextResponse.json({ success: true, campaignId: data.id, skipMetrics });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to create campaign' }, { status: 500 });
  }
}
