import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/seed-engine/status
 * Returns the current state of the seed engine:
 * - Active campaigns count
 * - Available seeds count
 * - Today's interactions
 * - Pool velocity
 * - Time dilation factor
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split('T')[0];

    // Active campaigns
    const { data: campaigns, error: campError } = await supabase
      .from('track_campaigns')
      .select('id, current_stage, total_streams, spent_cents, total_budget_cents')
      .eq('is_active', true)
      .eq('is_paused', false);

    if (campError) throw campError;

    // Available seeds
    const { data: seeds, error: seedError } = await supabase
      .from('users')
      .select('id, country, primary_genre, archetype, pool_id')
      .eq('user_type', 'seed')
      .eq('is_active', true);

    if (seedError) throw seedError;

    // Today's interactions
    const { data: interactions, error: intError } = await supabase
      .from('seed_interaction_log')
      .select('id, interaction_type')
      .gte('created_at', `${today}T00:00:00Z`);

    if (intError) throw intError;

    // Pool velocity (latest hour)
    const { data: velocity } = await supabase
      .from('pool_velocity_log')
      .select('*')
      .order('hour_bucket', { ascending: false })
      .limit(1)
      .single();

    // Time dilation
    const { data: dilation } = await supabase
      .from('time_dilation_state')
      .select('*')
      .order('last_calculated', { ascending: false })
      .limit(1)
      .single();

    // Seed schedules (how many are due)
    const { data: dueSeeds } = await supabase
      .from('seed_posting_schedule')
      .select('seed_id')
      .lte('next_due_at', new Date().toISOString())
      .lt('posts_today', 'posts_target');

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      campaigns: {
        active: campaigns?.length || 0,
        stages: campaigns?.reduce((acc: any, c: any) => {
          acc[c.current_stage] = (acc[c.current_stage] || 0) + 1;
          return acc;
        }, {}),
      },
      seeds: {
        total: seeds?.length || 0,
        byCountry: seeds?.reduce((acc: any, s: any) => {
          acc[s.country] = (acc[s.country] || 0) + 1;
          return acc;
        }, {}),
        byArchetype: seeds?.reduce((acc: any, s: any) => {
          const archetype = s.archetype || 'unknown';
          acc[archetype] = (acc[archetype] || 0) + 1;
          return acc;
        }, {}),
        dueNow: dueSeeds?.length || 0,
      },
      today: {
        totalInteractions: interactions?.length || 0,
        byType: interactions?.reduce((acc: any, i: any) => {
          acc[i.interaction_type] = (acc[i.interaction_type] || 0) + 1;
          return acc;
        }, {}),
      },
      pool: {
        velocity: velocity || null,
        dilation: dilation || null,
      },
    });
  } catch (err: any) {
    console.error('[SeedEngine] Status error:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
