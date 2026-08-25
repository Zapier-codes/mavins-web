// src/services/campaign/campaign.service.ts
import { createClient, supabase } from '@/lib/supabase/client';
import { calculatePricing } from '@/lib/campaign/pricing';
import { addOrder, getServices, findYouTubeViewService, calculateFreshConnectQuantity } from '@/services/freshconnect/freshconnect.service';

export interface CampaignInput {
  sourceUrl: string;
  viewCount: number;
  artistId: string;
}

export interface CampaignRecord {
  id: string;
  source_url: string;
  resolved_song_id: string | null;
  artist_id: string;
  total_budget_cents: number;
  spent_cents: number;
  geographic_tier: string;
  target_countries: string[];
  target_genres: string[];
  current_stage: string;
  is_active: boolean;
  is_paused: boolean;
  total_streams: number;
  fresh_connect_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createCampaign(input: CampaignInput): Promise<{ success: boolean; campaign?: CampaignRecord; error?: string }> {
  try {
    const pricing = calculatePricing(input.viewCount);

    // Check wallet balance
    const { data: walletData, error: walletError } = await supabase
      .from('wallet_ledger')
      .select('amount_cents')
      .eq('user_id', input.artistId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (walletError) throw walletError;

    const balanceCents = walletData?.[0]?.amount_cents || 0;
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

    // Place Fresh Connect order
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
      // Continue without Fresh Connect — the campaign still works via seed engine
    }

    // Insert campaign
    const { data: campaign, error: insertError } = await supabase
      .from('track_campaigns')
      .insert({
        source_url: input.sourceUrl,
        resolved_song_id: resolvedSongId,
        artist_id: input.artistId,
        total_budget_cents: pricing.totalCostCents,
        spent_cents: 0,
        geographic_tier: 'local',
        target_countries: [],
        target_genres: [],
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
    console.error('Error fetching campaigns:', error);
    return [];
  }

  return data || [];
}

export async function getCampaignAnalytics(campaignId: string) {
  const { data, error } = await supabase
    .from('campaign_daily_metrics')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('metric_date', { ascending: true });

  if (error) {
    console.error('Error fetching analytics:', error);
    return [];
  }

  return data || [];
}

export async function getArtistDashboard(artistId: string) {
  const { data, error } = await supabase
    .rpc('get_artist_dashboard', { p_artist_id: artistId });

  if (error) {
    console.error('Error fetching dashboard:', error);
    return null;
  }

  return data;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
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
