// src/app/api/share/track/[shareId]/route.ts (updated with batch)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClickBatcher } from '@/lib/utils/clickBatcher';

// Force dynamic rendering — this route writes to the database and requires
// runtime env vars. Without this, Next.js tries to statically collect page
// data at build time, evaluating the module before env vars are available.
export const dynamic = 'force-dynamic';

// Initialize inside a helper (called from each handler) so the client is
// never created at module load time (which happens during the build's
// static analysis phase). Uses the service role key for write access —
// this must never be a NEXT_PUBLIC_ var, since that would ship the secret
// admin key to the browser.
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase env vars');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  try {
    const shareId = params.shareId;
    
    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    // Get client IP and user agent for analytics
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const platform = getPlatform(userAgent);

    // Add to batch (doesn't hit database immediately)
    const batcher = getClickBatcher();
    batcher.addClick(shareId);

    // Insert click analytics asynchronously (non-blocking)
    // This is a separate operation from the click count
    (async () => {
      try {
        const supabase = getServiceClient();
        await supabase
          .from('share_analytics')
          .insert({
            share_id: shareId,
            ip_address: ip,
            user_agent: userAgent,
            platform: platform,
            clicked_at: new Date().toISOString(),
          });
        // Analytics inserted successfully
      } catch (error) {
        console.warn('[Share Track] Analytics insert error (non-critical):', error);
      }
    })();

    return NextResponse.json({
      success: true,
      message: 'Click tracked successfully',
      shareId,
    });
  } catch (error) {
    console.error('[Share Track] Error:', error);
    return NextResponse.json(
      { error: 'Failed to track share click' },
      { status: 500 }
    );
  }
}

function getPlatform(userAgent: string): string {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'web';
}

export async function GET(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  try {
    const shareId = params.shareId;
    
    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    const { data, error } = await getServiceClient()
      .from('shares')
      .select('*')
      .eq('share_id', shareId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      share: {
        shareId: data.share_id,
        trackId: data.track_id,
        userId: data.user_id,
        title: data.title,
        artist: data.artist,
        thumbnail: data.thumbnail,
        createdAt: data.created_at,
        clicks: data.clicks || 0,
        lastClick: data.last_click || null,
      }
    });
  } catch (error) {
    console.error('[Share Track] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get share data' },
      { status: 500 }
    );
  }
}
