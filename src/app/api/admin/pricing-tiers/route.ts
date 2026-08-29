import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * Admin CRUD for public.pricing_tiers (migration 010).
 *
 * Task 46a (handover.md) — deliberately no GET here: the promote page
 * (and any future admin read view) already reads this table directly
 * via useReferenceData()'s TanStack Query hook (Task 45 Part 2), which
 * RLS's "Public read pricing_tiers" policy permits without going
 * through an admin-gated route at all. This route exists only for the
 * three mutating verbs RLS explicitly does NOT permit for anon/
 * authenticated (migration 010's own RLS section: "no INSERT/UPDATE/
 * DELETE for anon or authenticated").
 *
 * A write here reaches the promote page's live slider automatically —
 * no manual cache-invalidation call needed from this route. Task 45
 * Part 2's Realtime subscription (useReferenceData.ts) fires on any
 * INSERT/UPDATE/DELETE to this table and invalidates the shared query
 * key itself.
 *
 * POST body:   { id, minViews, maxViews, pricePer1KCents, label, description, color?, sortOrder }
 * PATCH body:  { id, ...any subset of the same fields to change }
 * DELETE body: { id }
 *
 * Deliberately shallow validation (types/presence only) — this route
 * does NOT check for overlapping/gapped min_views-max_views ranges
 * across tiers, which calculatePricing()'s tier lookup silently
 * tolerates today (falls back to the last tier if nothing matches) but
 * could still produce a confusing/wrong price for some view counts if
 * an admin creates a genuine gap. Flagged as a known limitation in
 * handover.md's Task 46a note — a fuller validation pass is a
 * reasonable follow-up, not built here.
 */

interface TierRow {
  id: string;
  min_views: number;
  max_views: number;
  price_per_1k_cents: number;
  label: string;
  description: string;
  color?: string | null;
  sort_order: number;
}

function fromBody(body: any, requireAll: boolean): Partial<TierRow> | { error: string } {
  const row: Partial<TierRow> = {};
  if (body.id !== undefined) row.id = String(body.id);
  if (body.minViews !== undefined) row.min_views = Number(body.minViews);
  if (body.maxViews !== undefined) row.max_views = Number(body.maxViews);
  if (body.pricePer1KCents !== undefined) row.price_per_1k_cents = Number(body.pricePer1KCents);
  if (body.label !== undefined) row.label = String(body.label);
  if (body.description !== undefined) row.description = String(body.description);
  if (body.color !== undefined) row.color = body.color === null ? null : String(body.color);
  if (body.sortOrder !== undefined) row.sort_order = Number(body.sortOrder);

  if (requireAll) {
    const required: (keyof TierRow)[] = ['id', 'min_views', 'max_views', 'price_per_1k_cents', 'label', 'description', 'sort_order'];
    for (const key of required) {
      if (row[key] === undefined) return { error: `Missing required field: ${key}` };
    }
  }
  for (const numKey of ['min_views', 'max_views', 'price_per_1k_cents', 'sort_order'] as const) {
    if (row[numKey] !== undefined && !Number.isFinite(row[numKey])) {
      return { error: `${numKey} must be a finite number` };
    }
  }
  return row;
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  const row = fromBody(body, true);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });

  const { data, error } = await context.admin.from('pricing_tiers').insert(row).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, tier: data });
}

export async function PATCH(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  const row = fromBody(body, false);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });
  const { id, ...updates } = row;

  const { data, error } = await context.admin.from('pricing_tiers').update(updates).eq('id', body.id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, tier: data });
}

export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

  const { error } = await context.admin.from('pricing_tiers').delete().eq('id', body.id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
