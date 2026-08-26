// src/services/seed/seedEngine.service.ts
/**
 * Mavins Seed Engine v3.0
 * 
 * Orchestrates synthetic engagement across the platform using the existing
 * seed user pool (50+ international artist personas) and the sophisticated
 * pool/mood/velocity scheduling system.
 * 
 * The engine runs on a cron schedule (every 15 minutes) and:
 * 1. Ingests active campaigns from track_campaigns
 * 2. Calibrates target daily plays per campaign based on growth stage
 * 3. Selects eligible seeds from users table (respecting pool_id, genre, archetype, cooldown)
 * 4. Checks seed_posting_schedule for availability
 * 5. Executes interactions via record_campaign_stream RPC
 * 6. Updates pool_velocity_log and time_dilation_state
 * 7. Syncs campaign metrics to Nakama leaderboards and storage
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { nakamaService } from '@/services/nakama/nakama.service';

// ── Configuration ────────────────────────────────────────────

const STAGE_TARGETS: Record<string, { dailyPlays: number; saveRate: number; shareRate: number; commentRate: number }> = {
  planting:      { dailyPlays: 200,   saveRate: 0.15, shareRate: 0.05, commentRate: 0.02 },
  germination:   { dailyPlays: 800,   saveRate: 0.20, shareRate: 0.08, commentRate: 0.03 },
  root_system:   { dailyPlays: 2000,  saveRate: 0.25, shareRate: 0.12, commentRate: 0.05 },
  branching:     { dailyPlays: 5000,  saveRate: 0.30, shareRate: 0.18, commentRate: 0.08 },
  full_bloom:    { dailyPlays: 10000, saveRate: 0.35, shareRate: 0.25, commentRate: 0.12 },
};

const COST_PER_SEED_PLAY_CENTS = 3;
const COST_PER_PARTIAL_PLAY_CENTS = 1;

interface Campaign {
  id: string;
  track_id: string;
  artist_id: string;
  total_budget_cents: number;
  spent_cents: number;
  current_stage: string;
  geographic_tier: string;
  target_countries: string[];
  target_genres: string[];
  seed_persona_bias: string[];
  total_streams: number;
  real_streams: number;
  seeded_streams: number;
}

interface SeedUser {
  id: string;
  artist_name: string;
  country: string;
  city: string | null;
  primary_genre: string | null;
  archetype: string | null;
  pool_id: string | null;
  tier: string | null;
  role: string | null;
  timezone: string | null;
  cooldown_until: string | null;
  high_yield_multiplier: number;
}

interface SeedSchedule {
  seed_id: string;
  pool_id: string;
  posts_today: number;
  posts_target: number;
  next_due_at: string | null;
  reset_at: string;
}

interface ExecutionResult {
  campaignId: string;
  interactions: number;
  seedsUsed: string[];
  costCents: number;
  errors: string[];
}

// ── Main Engine ──────────────────────────────────────────────

export class SeedEngine {
  private supabase: SupabaseClient;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.supabase = createClient(url, key);
  }

  /**
   * Main entry point — called by the cron job or manual trigger.
   */
  async run(): Promise<{ success: boolean; results: ExecutionResult[]; summary: string }> {
    const startTime = Date.now();
    const results: ExecutionResult[] = [];
    const errors: string[] = [];

    try {
      // 1. INGEST: Get all active campaigns with budget remaining
      const campaigns = await this.getActiveCampaigns();
      if (campaigns.length === 0) {
        return { success: true, results: [], summary: 'No active campaigns to seed.' };
      }

      // 2. Reset daily posting counters for seeds whose reset_at < today
      await this.resetExpiredSeedCounters();

      // 3. Get global pool state for time dilation
      const dilation = await this.getTimeDilation();

      for (const campaign of campaigns) {
        try {
          const result = await this.processCampaign(campaign, dilation);
          results.push(result);
        } catch (err: any) {
          errors.push(`Campaign ${campaign.id}: ${err.message}`);
        }
      }

      // 4. Update pool velocity log
      await this.updatePoolVelocity(results);

      // 5. Sync top campaigns to Nakama
      await this.syncToNakama(campaigns, results);

      const duration = Date.now() - startTime;
      const totalInteractions = results.reduce((s, r) => s + r.interactions, 0);
      const totalCost = results.reduce((s, r) => s + r.costCents, 0);

      return {
        success: true,
        results,
        summary: `Processed ${campaigns.length} campaigns, ${totalInteractions} interactions, ${totalCost} cents spent. Duration: ${duration}ms. Errors: ${errors.length}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        results,
        summary: `Engine failed: ${err.message}`,
      };
    }
  }

  // ── Step 1: Ingest ─────────────────────────────────────────

  private async getActiveCampaigns(): Promise<Campaign[]> {
    const { data, error } = await this.supabase
      .from('track_campaigns')
      .select('*')
      .eq('is_active', true)
      .eq('is_paused', false)
      .lt('spent_cents', 'total_budget_cents')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Campaign[];
  }

  // ── Step 2: Reset expired seed counters ────────────────────

  private async resetExpiredSeedCounters(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await this.supabase
      .from('seed_posting_schedule')
      .update({
        posts_today: 0,
        reset_at: today,
        updated_at: new Date().toISOString(),
      })
      .lt('reset_at', today);

    if (error) console.warn('[SeedEngine] Reset counters error:', error.message);
  }

  // ── Step 3: Time dilation ──────────────────────────────────

  private async getTimeDilation(): Promise<number> {
    const { data } = await this.supabase
      .from('time_dilation_state')
      .select('dilation_factor')
      .order('last_calculated', { ascending: false })
      .limit(1)
      .single();

    return data?.dilation_factor || 1.0;
  }

  // ── Step 4: Process single campaign ────────────────────────

  private async processCampaign(campaign: Campaign, dilation: number): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      campaignId: campaign.id,
      interactions: 0,
      seedsUsed: [],
      costCents: 0,
      errors: [],
    };

    const stageConfig = STAGE_TARGETS[campaign.current_stage] || STAGE_TARGETS.planting;
    const targetDaily = Math.round(stageConfig.dailyPlays * dilation);

    // Check how many plays already today
    const today = new Date().toISOString().split('T')[0];
    const { data: metrics } = await this.supabase
      .from('campaign_daily_metrics')
      .select('streams')
      .eq('campaign_id', campaign.id)
      .eq('metric_date', today)
      .single();

    const playedToday = metrics?.streams || 0;
    const needed = Math.max(0, targetDaily - playedToday);
    if (needed <= 0) return result;

    // Check remaining budget
    const budgetRemaining = campaign.total_budget_cents - campaign.spent_cents;
    const maxAffordable = Math.floor(budgetRemaining / COST_PER_SEED_PLAY_CENTS);
    const toExecute = Math.min(needed, maxAffordable, 50); // Cap at 50 per batch

    if (toExecute <= 0) {
      // Budget exhausted — auto-pause
      await this.supabase
        .from('track_campaigns')
        .update({ is_active: false, completed_at: new Date().toISOString() })
        .eq('id', campaign.id);
      return result;
    }

    // Select eligible seeds
    const seeds = await this.selectSeeds(campaign, toExecute);
    if (seeds.length === 0) {
      result.errors.push('No eligible seeds found');
      return result;
    }

    // Execute interactions
    for (const seed of seeds) {
      try {
        const isFullListen = Math.random() > 0.3; // 70% full listens
        const listenDuration = isFullListen
          ? 180 + Math.floor(Math.random() * 120) // 3-5 min
          : 30 + Math.floor(Math.random() * 90);  // 30s-2min

        // Call record_campaign_stream RPC
        const { error: rpcError } = await this.supabase.rpc('record_campaign_stream', {
          p_campaign_id: campaign.id,
          p_user_id: seed.id,
          p_listen_duration_seconds: listenDuration,
          p_country_code: this.countryToCode(seed.country),
          p_is_full_listen: isFullListen,
        });

        if (rpcError) {
          result.errors.push(`Seed ${seed.id}: ${rpcError.message}`);
          continue;
        }

        // Update seed schedule
        await this.updateSeedSchedule(seed.id);

        // Maybe also save/share/comment based on rates
        await this.maybeSecondaryInteraction(campaign.id, seed, stageConfig);

        result.interactions++;
        result.seedsUsed.push(seed.id);
        result.costCents += isFullListen ? COST_PER_SEED_PLAY_CENTS : COST_PER_PARTIAL_PLAY_CENTS;

      } catch (err: any) {
        result.errors.push(`Seed ${seed.id}: ${err.message}`);
      }
    }

    // Check stage progression
    await this.maybeAdvanceStage(campaign);

    return result;
  }

  // ── Step 5: Seed selection ─────────────────────────────────

  private async selectSeeds(campaign: Campaign, limit: number): Promise<SeedUser[]> {
    let query = this.supabase
      .from('users')
      .select('id, artist_name, country, city, primary_genre, archetype, pool_id, tier, role, timezone, cooldown_until, high_yield_multiplier')
      .eq('user_type', 'seed')
      .eq('is_active', true)
      .or(`cooldown_until.lt.${new Date().toISOString()},cooldown_until.is.null`)
      .limit(limit * 3); // Over-fetch for filtering

    // Geographic filter
    if (campaign.target_countries && campaign.target_countries.length > 0) {
      query = query.in('country', campaign.target_countries);
    }

    // Genre filter
    if (campaign.target_genres && campaign.target_genres.length > 0) {
      query = query.in('primary_genre', campaign.target_genres);
    }

    // Persona/archetype filter
    if (campaign.seed_persona_bias && campaign.seed_persona_bias.length > 0) {
      query = query.in('archetype', campaign.seed_persona_bias);
    }

    const { data, error } = await query;
    if (error) throw error;

    const candidates = (data || []) as SeedUser[];

    // Check posting schedule — only seeds with availability
    const eligible: SeedUser[] = [];
    for (const seed of candidates) {
      if (eligible.length >= limit) break;

      const { data: schedule } = await this.supabase
        .from('seed_posting_schedule')
        .select('*')
        .eq('seed_id', seed.id)
        .single();

      const sched = schedule as SeedSchedule | null;
      if (!sched) {
        // No schedule yet — create one and allow
        await this.supabase.from('seed_posting_schedule').insert({
          seed_id: seed.id,
          pool_id: seed.pool_id || 'global',
          posts_target: 15,
          posts_today: 0,
          reset_at: new Date().toISOString().split('T')[0],
        });
        eligible.push(seed);
        continue;
      }

      const canPost = sched.posts_today < sched.posts_target;
      const isDue = !sched.next_due_at || new Date(sched.next_due_at) <= new Date();

      if (canPost && isDue) {
        eligible.push(seed);
      }
    }

    return eligible;
  }

  // ── Step 6: Update seed schedule ───────────────────────────

  private async updateSeedSchedule(seedId: string): Promise<void> {
    const nextDue = new Date();
    nextDue.setMinutes(nextDue.getMinutes() + 30 + Math.floor(Math.random() * 90)); // 30-120 min jitter

    const { error } = await this.supabase
      .from('seed_posting_schedule')
      .update({
        last_post_at: new Date().toISOString(),
        next_due_at: nextDue.toISOString(),
        posts_today: 1, // Will be incremented properly via RPC or raw SQL
        updated_at: new Date().toISOString(),
      })
      .eq('seed_id', seedId);

    if (error) console.warn('[SeedEngine] Schedule update error:', error.message);
  }

  // ── Step 7: Secondary interactions (save/share/comment) ────

  private async maybeSecondaryInteraction(
    campaignId: string,
    seed: SeedUser,
    config: { saveRate: number; shareRate: number; commentRate: number }
  ): Promise<void> {
    const rand = Math.random();

    if (rand < config.saveRate) {
      await this.supabase.from('seed_interaction_log').insert({
        campaign_id: campaignId,
        seed_user_id: seed.id,
        interaction_type: 'save',
        persona_archetype: seed.archetype || 'casual',
        computed_cost_cents: 2,
      });
    }

    if (rand < config.shareRate) {
      await this.supabase.from('seed_interaction_log').insert({
        campaign_id: campaignId,
        seed_user_id: seed.id,
        interaction_type: 'share',
        persona_archetype: seed.archetype || 'casual',
        computed_cost_cents: 5,
      });
    }

    if (rand < config.commentRate) {
      await this.supabase.from('seed_interaction_log').insert({
        campaign_id: campaignId,
        seed_user_id: seed.id,
        interaction_type: 'comment',
        persona_archetype: seed.archetype || 'casual',
        computed_cost_cents: 10,
      });
    }
  }

  // ── Step 8: Stage advancement ──────────────────────────────

  private async maybeAdvanceStage(campaign: Campaign): Promise<void> {
    const thresholds: Record<string, number> = {
      planting: 1000,
      germination: 10000,
      root_system: 50000,
      branching: 250000,
    };

    const nextStage: Record<string, string> = {
      planting: 'germination',
      germination: 'root_system',
      root_system: 'branching',
      branching: 'full_bloom',
    };

    const threshold = thresholds[campaign.current_stage];
    const next = nextStage[campaign.current_stage];

    if (threshold && next && campaign.total_streams >= threshold) {
      await this.supabase
        .from('track_campaigns')
        .update({
          current_stage: next,
          stage_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);

      // Unlock milestone
      try {
        await this.supabase.from('artist_growth_milestones').insert({
          artist_id: campaign.artist_id,
          campaign_id: campaign.id,
          milestone_type: `first_${threshold >= 1000 ? (threshold >= 10000 ? (threshold >= 50000 ? (threshold >= 100000 ? '1m' : '100k') : '50k') : '10k') : '1k'}_streams`,
        });
      } catch {
        // Ignore duplicate milestone errors
      }
    }
  }

  // ── Step 9: Pool velocity update ───────────────────────────

  private async updatePoolVelocity(results: ExecutionResult[]): Promise<void> {
    const hourBucket = new Date();
    hourBucket.setMinutes(0, 0, 0);

    const totalSeeds = results.reduce((s, r) => s + r.interactions, 0);

    try {
      await this.supabase.rpc('update_pool_velocity', {
        p_pool_id: 'global',
        p_hour_bucket: hourBucket.toISOString(),
        p_seed_count: totalSeeds,
      });
    } catch (err: any) {
      console.warn('[SeedEngine] Velocity update error:', err.message);
    }
  }

  // ── Step 10: Nakama sync ───────────────────────────────────

  private async syncToNakama(campaigns: Campaign[], results: ExecutionResult[]): Promise<void> {
    try {
      // Update campaign leaderboards
      for (const campaign of campaigns) {
        const result = results.find(r => r.campaignId === campaign.id);
        if (!result || result.interactions === 0) continue;

        await nakamaService.writeLeaderboardRecord(
          'campaign_streams',
          campaign.artist_id,
          campaign.total_streams + result.interactions
        );

        // Store campaign metadata
        await nakamaService.writeStorageObject(
          campaign.artist_id,
          'campaigns',
          campaign.id,
          {
            stage: campaign.current_stage,
            total_streams: campaign.total_streams,
            seeded_streams: campaign.seeded_streams,
            spent_cents: campaign.spent_cents,
            updated_at: new Date().toISOString(),
          }
        );
      }

      // Update artist leaderboard
      const artistIds = [...new Set(campaigns.map(c => c.artist_id))];
      for (const artistId of artistIds) {
        const { data: artistCampaigns } = await this.supabase
          .from('track_campaigns')
          .select('total_streams')
          .eq('artist_id', artistId);

        const totalStreams = (artistCampaigns || []).reduce((s, c) => s + (c.total_streams || 0), 0);

        await nakamaService.writeLeaderboardRecord(
          'artist_total_streams',
          artistId,
          totalStreams
        );
      }
    } catch (err: any) {
      console.warn('[SeedEngine] Nakama sync error:', err.message);
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private countryToCode(country: string): string {
    const map: Record<string, string> = {
      'Nigeria': 'NG', 'Ghana': 'GH', 'South Africa': 'ZA', 'Kenya': 'KE',
      'United Kingdom': 'GB', 'United States': 'US', 'France': 'FR',
      'Germany': 'DE', 'India': 'IN', 'Brazil': 'BR', 'Mexico': 'MX',
      'Australia': 'AU', 'Canada': 'CA', 'South Korea': 'KR', 'Japan': 'JP',
      'Netherlands': 'NL', 'Spain': 'ES', 'Italy': 'IT', 'Argentina': 'AR',
      'Colombia': 'CO', 'Chile': 'CL', 'Peru': 'PE', 'Turkey': 'TR',
      'Indonesia': 'ID', 'Philippines': 'PH', 'Thailand': 'TH', 'Malaysia': 'MY',
      'Morocco': 'MA', 'Ethiopia': 'ET', 'Tanzania': 'TZ', 'Lebanon': 'LB',
      'Pakistan': 'PK', 'Cyprus': 'CY', 'Czech Republic': 'CZ',
      'Bosnia and Herzegovina': 'BA', 'Serbia': 'RS', 'Norway': 'NO',
      'Finland': 'FI', 'New Zealand': 'NZ', 'Venezuela': 'VE',
    };
    return map[country] || 'XX';
  }
}

// Singleton instance
export const seedEngine = new SeedEngine();
