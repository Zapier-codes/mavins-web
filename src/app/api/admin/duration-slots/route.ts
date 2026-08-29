import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { logAdminAction } from '@/lib/admin/auditLog';

/**
 * Admin CRUD for public.duration_slots (migration 010).
 * See api/admin/pricing-tiers/route.ts for the full shared reasoning
 * (no GET, Realtime-driven cache refresh, shallow validation only) —
 * not repeated here.
 *
 * POST body:   { id, label, weeks, days, maxDailyDrip, maxViews, description, badge, sortOrder }
 * PATCH body:  { id, ...any subset of the same fields }
 * DELETE body: { id }
 */

interface SlotRow {
  id: string;
  label: string;
  weeks: number;
  days: number;
  max_daily_drip: number;
  max_views: number;
  description: string;
  badge: string;
  sort_order: number;
}

function fromBody(body: any, requireAll: boolean): Partial<SlotRow> | { error: string } {
  const row: Partial<SlotRow> = {};
  if (body.id !== undefined) row.id = String(body.id);
  if (body.label !== undefined) row.label = String(body.label);
  if (body.weeks !== undefined) row.weeks = Number(body.weeks);
  if (body.days !== undefined) row.days = Number(body.days);
  if (body.maxDailyDrip !== undefined) row.max_daily_drip = Number(body.maxDailyDrip);
  if (body.maxViews !== undefined) row.max_views = Number(body.maxViews);
  if (body.description !== undefined) row.description = String(body.description);
  if (body.badge !== undefined) row.badge = String(body.badge);
  if (body.sortOrder !== undefined) row.sort_order = Number(body.sortOrder);

  if (requireAll) {
    const required: (keyof SlotRow)[] = ['id', 'label', 'weeks', 'days', 'max_daily_drip', 'max_views', 'description', 'badge', 'sort_order'];
    for (const key of required) {
      if (row[key] === undefined) return { error: `Missing required field: ${key}` };
    }
  }
  for (const numKey of ['weeks', 'days', 'max_daily_drip', 'max_views', 'sort_order'] as const) {
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

  const { data, error } = await context.admin.from('duration_slots').insert(row).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'duration_slots.create',
    tableName: 'duration_slots',
    recordId: data.id,
    oldValue: null,
    newValue: data,
  });

  return NextResponse.json({ success: true, slot: data });
}

export async function PATCH(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  const row = fromBody(body, false);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });
  const { id, ...updates } = row;

  const { data: previous } = await context.admin.from('duration_slots').select('*').eq('id', body.id).maybeSingle();

  const { data, error } = await context.admin.from('duration_slots').update(updates).eq('id', body.id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'duration_slots.update',
    tableName: 'duration_slots',
    recordId: body.id,
    oldValue: previous,
    newValue: data,
  });

  return NextResponse.json({ success: true, slot: data });
}

export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

  const { data: previous } = await context.admin.from('duration_slots').select('*').eq('id', body.id).maybeSingle();

  const { error } = await context.admin.from('duration_slots').delete().eq('id', body.id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'duration_slots.delete',
    tableName: 'duration_slots',
    recordId: body.id,
    oldValue: previous,
    newValue: null,
  });

  return NextResponse.json({ success: true });
}
