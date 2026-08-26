// src/services/campaign/campaign.service.ts
import { supabase } from '@/lib/supabase/client';
import { calculatePricing, type PricingResult } from '@/lib/campaign/pricing';

interface CreateCampaignInput {
  sourceUrl: string;
  viewCount: number;
  artistId: string;
  genre?: string;
  geographicTier?: string;
  targetCountries?: string[];
}

interface CampaignResult {
  success: boolean;
  campaignId?: string;
  error?: string;
}

/** Read wallet balance from users.wallet JSONB (no RPC needed). */
async function getWalletBalanceCents(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('wallet')
    .eq('id', userId)
    .single();
  if (error || !data?.wallet) return 0;
  // wallet is JSONB: { balance: number, currency: string }
  const wallet = typeof data.wallet === 'string' ? JSON.parse(data.wallet) : data.wallet;
  return (wallet?.balance || 0);
}

/** Credit/debit wallet by updating users.wallet JSONB + logging to wallet_ledger.changeset. */
async function updateWallet(userId: string, amountCents: number, description: string) {
  const currentBalance = await getWalletBalanceCents(userId);
  const newBalance = Math.max(0, currentBalance + amountCents);

  // Update users.wallet JSONB
  const { error: walletError } = await supabase
    .from('users')
    .update({
      wallet: { balance: newBalance, currency: 'USD' },
      update_time: new Date().toISOString(),
    })
    .eq('id', userId);

  if (walletError) throw walletError;

  // Log to wallet_ledger.changeset JSONB
  await supabase.from('wallet_ledger').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    changeset: {
      amount: amountCents,
      currency: 'USD',
      type: amountCents >= 0 ? 'credit' : 'debit',
      description,
      previous_balance: currentBalance,
      new_balance: newBalance,
    },
    metadata: { source: 'campaign_service' },
    create_time: new Date().toISOString(),
    update_time: new Date().toISOString(),
  });

  return newBalance;
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignResult> {
  try {
    const pricing = calculatePricing(input.viewCount);

    // Check wallet balance via users.wallet JSONB
    const balanceCents = await getWalletBalanceCents(input.artistId);
    if (balanceCents < pricing.totalCostCents) {
      return { success: false, error: 'Insufficient wallet balance. Please add funds.' };
    }

    // Deduct from wallet
    await updateWallet(
      input.artistId,
      -pricing.totalCostCents,
      `Campaign creation: ${input.sourceUrl.slice(0, 50)}`
    );

    const { data, error } = await supabase
      .from('track_campaigns')
      .insert({
        source_url: input.sourceUrl,
        artist_id: input.artistId,
        total_budget_cents: pricing.totalCostCents,
        spent_cents: 0,
        geographic_tier: input.geographicTier || 'local',
        target_countries: input.targetCountries || [],
        target_genres: input.genre ? [input.genre] : [],
        current_stage: 'planting',
        is_active: true,
        is_paused: false,
        total_streams: 0,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, campaignId: data.id };
  } catch (error: any) {
    console.error('Campaign creation error:', error);
    return { success: false, error: error.message || 'Failed to create campaign' };
  }
}

export async function getArtistCampaigns(artistId: string) {
  const { data, error } = await supabase
    .from('track_campaigns')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
    return [];
  }
  return data || [];
}

export async function getCampaignById(campaignId: string) {
  const { data, error } = await supabase
    .from('track_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error) {
    console.error('Error fetching campaign:', error);
    return null;
  }
  return data;
}

export async function pauseCampaign(campaignId: string) {
  const { error } = await supabase
    .from('track_campaigns')
    .update({ is_paused: true, updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  return !error;
}

export async function resumeCampaign(campaignId: string) {
  const { error } = await supabase
    .from('track_campaigns')
    .update({ is_paused: false, updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  return !error;
}

export async function cancelCampaign(campaignId: string) {
  try {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) return { success: false, error: 'Campaign not found' };

    const unspent = (campaign.total_budget_cents || 0) - (campaign.spent_cents || 0);
    if (unspent > 0 && campaign.artist_id) {
      await updateWallet(
        campaign.artist_id,
        unspent,
        `Campaign refund: ${campaignId.slice(0, 8)}`
      );
    }

    const { error } = await supabase
      .from('track_campaigns')
      .update({
        is_active: false,
        is_paused: false,
        current_stage: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    return { success: !error, error: error?.message };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function addFundsToCampaign(campaignId: string, additionalCents: number) {
  try {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) return { success: false, error: 'Campaign not found' };

    // Check wallet via users.wallet JSONB
    const balance = await getWalletBalanceCents(campaign.artist_id);
    if (balance < additionalCents) {
      return { success: false, error: 'Insufficient wallet balance' };
    }

    // Deduct
    await updateWallet(
      campaign.artist_id,
      -additionalCents,
      `Campaign top-up: ${campaignId.slice(0, 8)}`
    );

    const { error } = await supabase
      .from('track_campaigns')
      .update({
        total_budget_cents: (campaign.total_budget_cents || 0) + additionalCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    return { success: !error, error: error?.message };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCampaignStats(campaignId: string) {
  const { data, error } = await supabase
    .from('track_campaigns')
    .select('total_streams, spent_cents, total_budget_cents')
    .eq('id', campaignId)
    .single();

  if (error) return null;
  return data;
}
