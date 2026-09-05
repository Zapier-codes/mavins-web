// src/app/api/listener/campaigns/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/listener/campaigns
 *
 * Task 66 Part a, sub-part ii-b-i (handover.md) — wires the `/earn`
 * page's task board to real, currently-live campaigns a listener can
 * play to earn from. No device/listener auth required — this is
 * public campaign metadata, the same trust level as the home banner
 * itself (`get_live_campaigns_for_banner()`, Task 59 Part 3), not
 * anything tied to a specific listener's identity or balance.
 *
 * Deliberately reuses that exact RPC rather than building a new one:
 * "reward-eligible" and "currently live" are the same set today (any
 * campaign a listener could tap into and earn from is, by definition,
 * one that's still live) — a genuinely narrower "reward-eligible"
 * concept (e.g. excluding a campaign a listener has already exhausted
 * some daily reward cap on) isn't part of this task's own spec and
 * isn't invented here.
 *
 * **Sub-part ii-b-ii (the actual `reward=true` deep-link to Velune,
 * not built yet) is NOT this route's job.** This route only supplies
 * the list to render; the `/earn` page marks each card as "coming
 * soon" until that part exists, rather than wiring a broken link.
 */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_live_campaigns_for_banner');

    if (error) {
      console.error('listener/campaigns: RPC failed', error);
      return NextResponse.json({ success: false, error: 'Failed to load campaigns' }, { status: 500 });
    }

    const campaigns = (data || []).map((row: any) => ({
      campaignId: row.campaign_id,
      trackTitle: row.track_title || 'Untitled',
      artistName: row.artist_name || 'Unknown Artist',
      coverUrl: row.cover_url || null,
      sourceUrl: row.source_url,
    }));

    return NextResponse.json({ success: true, campaigns });
  } catch (error: any) {
    console.error('listener/campaigns error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load campaigns' }, { status: 500 });
  }
}
