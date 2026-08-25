import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/share/resolve
 * Resolves a share URL to campaign/track data and increments click count.
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { shareId } = await request.json();
    if (!shareId) {
      return NextResponse.json({ error: 'shareId required' }, { status: 400 });
    }

    // Find share record
    const { data: share, error } = await supabase
      .from('shares')
      .select('*, campaign:track_campaigns(*)')
      .eq('id', shareId)
      .single();

    if (error || !share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }

    // Increment clicks
    await supabase
      .from('shares')
      .update({ clicks: (share.clicks || 0) + 1 })
      .eq('id', shareId);

    return NextResponse.json({
      success: true,
      share: {
        id: share.id,
        campaignId: share.campaign_id,
        trackId: share.track_id,
        shareUrl: share.share_url,
        clicks: (share.clicks || 0) + 1,
      },
    });
  } catch (error) {
    console.error('[Share Resolve] Error:', error);
    return NextResponse.json({ error: 'Failed to resolve share' }, { status: 500 });
  }
}
