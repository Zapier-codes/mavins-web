import { NextRequest, NextResponse } from 'next/server';
import { seedEngine } from '@/services/seed/seedEngine.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/seed-engine/run
 * Triggers the seed engine execution.
 * 
 * Security: Checks for a secret cron token to prevent unauthorized triggers.
 * Vercel Cron will call this with the CRON_SECRET header.
 * Manual triggers require the same secret.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await seedEngine.run();

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (err: any) {
    console.error('[SeedEngine] Route error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
