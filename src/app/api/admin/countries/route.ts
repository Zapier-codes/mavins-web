import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * Admin CRUD for public.countries (migration 010 + migration 012's
 * korapay_channels/korapay_default_channel columns).
 * See api/admin/pricing-tiers/route.ts for the full shared reasoning
 * (no GET, Realtime-driven cache refresh, shallow validation only).
 *
 * Deleting a country CASCADEs into genre_country_affinity (migration
 * 010's own FK: `country_code TEXT NOT NULL REFERENCES
 * public.countries(code) ON DELETE CASCADE`) — Postgres handles
 * cleaning up every affinity row for that country automatically, no
 * extra code needed here. Worth a confirm-dialog warning about that in
 * the eventual admin UI (46e's job, not built here) since it's a
 * real, non-obvious side effect of deleting one row.
 *
 * POST body:   { code, country, flag, sortOrder, korapayChannels?, korapayDefaultChannel? }
 * PATCH body:  { code, ...any subset of the same fields }
 * DELETE body: { code }
 */

interface CountryRow {
  code: string;
  country: string;
  flag: string;
  sort_order: number;
  korapay_channels?: string[] | null;
  korapay_default_channel?: string | null;
}

function fromBody(body: any, requireAll: boolean): Partial<CountryRow> | { error: string } {
  const row: Partial<CountryRow> = {};
  if (body.code !== undefined) row.code = String(body.code).toUpperCase();
  if (body.country !== undefined) row.country = String(body.country);
  if (body.flag !== undefined) row.flag = String(body.flag);
  if (body.sortOrder !== undefined) row.sort_order = Number(body.sortOrder);
  if (body.korapayChannels !== undefined) {
    if (body.korapayChannels !== null && !Array.isArray(body.korapayChannels)) {
      return { error: 'korapayChannels must be an array of strings or null' };
    }
    row.korapay_channels = body.korapayChannels === null ? null : body.korapayChannels.map(String);
  }
  if (body.korapayDefaultChannel !== undefined) {
    row.korapay_default_channel = body.korapayDefaultChannel === null ? null : String(body.korapayDefaultChannel);
  }

  if (requireAll) {
    const required: (keyof CountryRow)[] = ['code', 'country', 'flag', 'sort_order'];
    for (const key of required) {
      if (row[key] === undefined) return { error: `Missing required field: ${key}` };
    }
  }
  if (row.sort_order !== undefined && !Number.isFinite(row.sort_order)) {
    return { error: 'sort_order must be a finite number' };
  }
  return row;
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  const row = fromBody(body, true);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });

  const { data, error } = await context.admin.from('countries').insert(row).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, country: data });
}

export async function PATCH(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  if (!body?.code) return NextResponse.json({ success: false, error: 'code is required' }, { status: 400 });
  const row = fromBody(body, false);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });
  const { code, ...updates } = row;

  const { data, error } = await context.admin.from('countries').update(updates).eq('code', body.code).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, country: data });
}

export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  if (!body?.code) return NextResponse.json({ success: false, error: 'code is required' }, { status: 400 });

  const { error } = await context.admin.from('countries').delete().eq('code', body.code);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
