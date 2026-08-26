// src/app/api/share/resolve/[shareId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering — this route needs runtime env vars. Without this,
// Next.js tries to statically collect page data at build time, evaluating
// the module before env vars are available.
export const dynamic = 'force-dynamic';

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
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
      shareId: data.share_id,
      trackId: data.track_id,
      userId: data.user_id,
      title: data.title,
      artist: data.artist,
      thumbnail: data.thumbnail,
      taskId: data.task_id,
      createdAt: data.created_at,
      clicks: data.clicks || 0,
      lastClick: data.last_click || null,
    });
  } catch (error) {
    console.error('[Share Resolve] Error:', error);
    return NextResponse.json(
      { error: 'Failed to resolve share' },
      { status: 500 }
    );
  }
}