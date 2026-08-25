// src/services/campaign/campaign.service.ts
import { createClient, supabase } from '@/lib/supabase/client';
import { calculatePricing } from '@/lib/campaign/pricing';
import { addOrder, getServices, findYouTubeViewService, calculateFreshConnectQuantity } from '@/services/freshconnect/freshconnect.service';

export interface CampaignInput {
  sourceUrl: string;
  viewCount: number;
  artistId: string;
  genre?: string;
  geographicTier?: string;
  targetCountries?: string[];
}

export interface CampaignRecord {
  id: string;
  source_url: string;
  resolved_song_id: string | null;
  track_id: string | null;
  artist_id: string;
  total_budget_cents: number;
  spent_cents: number;
  geographic_tier: string;
  target_countries: string[];
  target_cities: string[];
  target_genres: string[];
  current_stage: string;
  is_active: boolean;
  is_paused: boolean;
  total_streams: number;
  real_streams: number;
  seeded_streams: number;
  save_count: number;
  playlist_add_count: number;
  share_count: number;
  comment_count: number;
  fresh_connect_order_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export async function createCampaign(input: CampaignInput): Promise<{ success: boolean; campaign?: CampaignRecord; error?: string }> {
  try {
    const pricing = calculatePricing(input.viewCount);

    // Check wallet balance via RPC
    const { data: balanceData, error: balanceError } = await supabase
      .rpc('get_wallet_balance', { p_user_id: input.artistId });

    if (balanceError) throw balanceError;

    const balanceCents = balanceData || 0;
    if (balanceCents < pricing.totalCostCents) {
      return { success: false, error: 'Insufficient wallet balance. Please add funds.' };
    }

    // Deduct from wallet
    const { error: deductError } = await supabase
      .from('wallet_ledger')
      .insert({
        user_id: input.artistId,
        amount_cents: -pricing.totalCostCents,
        type: 'fee',
        description: `Campaign creation: ${formatNumber(input.viewCount)} views`,
      });

    if (deductError) throw deductError;

    // Extract YouTube video ID from URL
    const resolvedSongId = extractYouTubeId(input.sourceUrl);

    // Place Fresh Connect order (best-effort, non-blocking)
    let freshConnectOrderId: string | null = null;
    try {
      const services = await getServices();
      const ytService = findYouTubeViewService(services);

      if (ytService) {
        const quantity = calculateFreshConnectQuantity(input.viewCount);
        const fcResult = await addOrder(
          parseInt(ytService.service.toString()),
          input.sourceUrl,
          quantity
        );
        freshConnectOrderId = fcResult.order.toString();
      }
    } catch (fcErr: any) {
      console.warn('Fresh Connect order failed (proceeding without):', fcErr.message);
    }

    // Insert campaign with full metadata
    const { data: campaign, error: insertError } = await supabase
      .from('track_campaigns')
      .insert({
        source_url: input.sourceUrl,
        resolved_song_id: resolvedSongId,
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
        fresh_connect_order_id: freshConnectOrderId,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return { success: true, campaign };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create campaign' };
  }
}

export async function getArtistCampaigns(artistId: string): Promise<CampaignRecord[]> {
  const { data, error } = await supabase
    .from('track_campaigns')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getArtistCampaigns error:', error);
    return [];
  }
  return data || [];
}

export async function getArtistDashboard(artistId: string): Promise<any> {
  const { data, error } = await supabase
    .rpc('get_artist_dashboard', { p_artist_id: artistId });

  if (error) {
    console.error('getArtistDashboard error:', error);
    return null;
  }
  return data;
}

// ── Campaign Management Actions ──────────────────────────────

export async function pauseCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('track_campaigns')
    .update({ is_paused: true, updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  return { success: !error, error: error?.message };
}

export async function resumeCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('track_campaigns')
    .update({ is_paused: false, updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  return { success: !error, error: error?.message };
}

export async function cancelCampaign(campaignId: string, artistId: string): Promise<{ success: boolean; refunded?: number; error?: string }> {
  // Get campaign to calculate refund
  const { data: campaign } = await supabase
    .from('track_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('artist_id', artistId)
    .single();

  if (!campaign) return { success: false, error: 'Campaign not found' };

  const unspent = campaign.total_budget_cents - campaign.spent_cents;

  // Refund unspent budget
  if (unspent > 0) {
    await supabase.from('wallet_ledger').insert({
      user_id: artistId,
      amount_cents: unspent,
      type: 'bonus',
      description: `Refund for cancelled campaign: ${campaignId.slice(0, 8)}`,
    });
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

  return { success: !error, refunded: unspent, error: error?.message };
}

export async function topUpCampaign(
  campaignId: string,
  artistId: string,
  additionalCents: number
): Promise<{ success: boolean; error?: string }> {
  // Check wallet
  const { data: balance } = await supabase.rpc('get_wallet_balance', { p_user_id: artistId });
  if ((balance || 0) < additionalCents) {
    return { success: false, error: 'Insufficient wallet balance' };
  }

  // Deduct
  await supabase.from('wallet_ledger').insert({
    user_id: artistId,
    amount_cents: -additionalCents,
    type: 'fee',
    description: `Campaign top-up: ${campaignId.slice(0, 8)}`,
  });

  // Update campaign
  const { error } = await supabase.rpc('increment_campaign_budget', {
    p_campaign_id: campaignId,
    p_additional_cents: additionalCents,
  });

  return { success: !error, error: error?.message };
}

// ── Helpers ──────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString('en-US');
}
