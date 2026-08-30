import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { ADMIN_CAPABILITIES } from '@/lib/auth/isAdmin';
import { logAdminAction } from '@/lib/admin/auditLog';

/**
 * Admin CRUD for public.genres (migration 010).
 * See api/admin/pricing-tiers/route.ts for the full shared reasoning
 * (no GET, Realtime-driven cache refresh, shallow validation only).
 *
 * Deleting a genre CASCADEs into genre_country_affinity, same as
 * countries/route.ts's own note — every affinity row for that genre
 * disappears automatically via the FK, not handled specially here.
 *
 * POST body:   { id, label, sortOrder }
 * PATCH body:  { id, label?, sortOrder? }
 * DELETE body: { id }
 */

interface GenreRow {
  id: string;
  label: string;
  sort_order: number;
}

function fromBody(body: any, requireAll: boolean): Partial<GenreRow> | { error: string } {
  const row: Partial<GenreRow> = {};
  if (body.id !== undefined) row.id = String(body.id);
  if (body.label !== undefined) row.label = String(body.label);
  if (body.sortOrder !== undefined) row.sort_order = Number(body.sortOrder);

  if (requireAll) {
    const required: (keyof GenreRow)[] = ['id', 'label', 'sort_order'];
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
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRES_EDIT);
  if (response) return response;

  const body = await request.json();
  const row = fromBody(body, true);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });

  const { data, error } = await context.admin.from('genres').insert(row).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'genres.create',
    tableName: 'genres',
    recordId: data.id,
    oldValue: null,
    newValue: data,
  });

  return NextResponse.json({ success: true, genre: data });
}

export async function PATCH(request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRES_EDIT);
  if (response) return response;

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  const row = fromBody(body, false);
  if ('error' in row) return NextResponse.json({ success: false, error: row.error }, { status: 400 });
  const { id, ...updates } = row;

  const { data: previous } = await context.admin.from('genres').select('*').eq('id', body.id).maybeSingle();

  const { data, error } = await context.admin.from('genres').update(updates).eq('id', body.id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'genres.update',
    tableName: 'genres',
    recordId: body.id,
    oldValue: previous,
    newValue: data,
  });

  return NextResponse.json({ success: true, genre: data });
}

export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRES_EDIT);
  if (response) return response;

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

  const { data: previous } = await context.admin.from('genres').select('*').eq('id', body.id).maybeSingle();

  const { error } = await context.admin.from('genres').delete().eq('id', body.id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'genres.delete',
    tableName: 'genres',
    recordId: body.id,
    oldValue: previous,
    newValue: null,
  });

  return NextResponse.json({ success: true });
}
