'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react';

/**
 * Task 46a (handover.md) — UI half, Part A of this session's own split
 * (see handover.md for the full A/B reasoning). Builds one reusable
 * admin create/edit/delete table, matching admin/page.tsx's existing
 * glass-card/table visual language rather than inventing a new one
 * (per that task's own note pointing at `frontend-design`'s guidance
 * on this being internal CRUD tooling, not greenfield brand design).
 *
 * Deliberately scoped to the shape `pricing_tiers` and `duration_slots`
 * both share: a single string `id` primary key, and every other field
 * a flat scalar (text or number) with no cross-row relationships. This
 * is Part A's whole point — prove the end-to-end pattern (list, add,
 * inline edit, delete, wired to a real admin API route, integrated
 * with Task 45 Part 2's shared query cache) on the two tables where
 * that shape fits cleanly, rather than half-solving all five at once.
 *
 * NOT designed for `countries` (extra Korapay columns + a real
 * cascade-delete warning needed — Task 46a's own note flags this
 * explicitly), `genres` (simple, but not built here — Part B), or
 * `genre_country_affinity` (composite `(genre_id, country_code)` key,
 * 350 rows, upsert-not-strict-create semantics on its API route) — see
 * this session's handover.md note for why those three are Part B, not
 * an oversight.
 */

export interface AdminCrudColumn<T> {
  key: keyof T & string;
  label: string;
  type: 'text' | 'number' | 'textarea';
  /** Shown in the table as a plain column; omit to keep a field
   * edit-only (rare for this component's two current use cases, but
   * available). */
  hideInTable?: boolean;
}

export interface AdminCrudTableProps<T extends { id: string }> {
  title: string;
  columns: AdminCrudColumn<T>[];
  rows: T[];
  isLoading: boolean;
  /** Row shape for a brand-new entry before the admin fills anything
   * in — every column should have a reasonable starting value here
   * (empty string / 0), since this component doesn't know your
   * business defaults. */
  emptyRow: Omit<T, 'id'> & { id?: string };
  onCreate: (row: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
  onUpdate: (id: string, updates: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export function AdminCrudTable<T extends { id: string }>({
  title,
  columns,
  rows,
  isLoading,
  emptyRow,
  onCreate,
  onUpdate,
  onDelete,
}: AdminCrudTableProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const visibleColumns = columns.filter((c) => !c.hideInTable);

  function startEdit(row: T) {
    setRowError(null);
    setEditingId(row.id);
    setDraft({ ...row });
    setIsCreating(false);
  }

  function startCreate() {
    setRowError(null);
    setIsCreating(true);
    setEditingId(null);
    setDraft({ ...emptyRow });
  }

  function cancel() {
    setEditingId(null);
    setIsCreating(false);
    setDraft({});
    setRowError(null);
  }

  function updateDraftField(key: string, type: AdminCrudColumn<T>['type'], value: string) {
    setDraft((prev) => ({ ...prev, [key]: type === 'number' ? (value === '' ? '' : Number(value)) : value }));
  }

  async function saveCreate() {
    setIsSaving(true);
    setRowError(null);
    const result = await onCreate(draft);
    setIsSaving(false);
    if (!result.success) {
      setRowError(result.error || 'Failed to create');
      return;
    }
    cancel();
  }

  async function saveEdit() {
    if (!editingId) return;
    setIsSaving(true);
    setRowError(null);
    const { id, ...updates } = draft;
    const result = await onUpdate(editingId, updates);
    setIsSaving(false);
    if (!result.success) {
      setRowError(result.error || 'Failed to save');
      return;
    }
    cancel();
  }

  async function confirmDelete(id: string) {
    setIsSaving(true);
    setRowError(null);
    const result = await onDelete(id);
    setIsSaving(false);
    setPendingDeleteId(null);
    if (!result.success) {
      setRowError(result.error || 'Failed to delete');
    }
  }

  return (
    <div className="glass-strong rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="font-semibold text-sm">{title}</h3>
        {!isCreating && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1db954] text-black text-xs font-semibold hover:bg-[#1ed760] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {rowError && (
        <div className="px-4 py-2 text-xs text-rose-400 bg-rose-500/10 border-b border-rose-500/20">
          {rowError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[var(--muted-foreground)]">
              {visibleColumns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 font-medium whitespace-nowrap">{col.label}</th>
              ))}
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isCreating && (
              <EditRow
                columns={visibleColumns}
                draft={draft}
                onChange={updateDraftField}
                onSave={saveCreate}
                onCancel={cancel}
                isSaving={isSaving}
              />
            )}
            {isLoading ? (
              <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-[var(--subtle-foreground)]">
                <Loader2 className="w-4 h-4 animate-spin inline" />
              </td></tr>
            ) : rows.length === 0 && !isCreating ? (
              <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-[var(--subtle-foreground)]">No rows yet.</td></tr>
            ) : (
              rows.map((row) =>
                editingId === row.id ? (
                  <EditRow
                    key={row.id}
                    columns={visibleColumns}
                    draft={draft}
                    onChange={updateDraftField}
                    onSave={saveEdit}
                    onCancel={cancel}
                    isSaving={isSaving}
                  />
                ) : (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                    {visibleColumns.map((col) => (
                      <td key={col.key} className="px-4 py-3 max-w-xs truncate">{String((row as any)[col.key] ?? '—')}</td>
                    ))}
                    <td className="px-4 py-3">
                      {pendingDeleteId === row.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-rose-400">Delete?</span>
                          <button onClick={() => confirmDelete(row.id)} disabled={isSaving} className="p-1 rounded hover:bg-rose-500/20 text-rose-400">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPendingDeleteId(null)} className="p-1 rounded hover:bg-white/10">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(row)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPendingDeleteId(row.id)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-rose-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow<T>({
  columns, draft, onChange, onSave, onCancel, isSaving,
}: {
  columns: AdminCrudColumn<T>[];
  draft: Record<string, any>;
  onChange: (key: string, type: AdminCrudColumn<T>['type'], value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <tr className="border-b border-white/5 bg-white/5">
      {columns.map((col) => (
        <td key={col.key} className="px-4 py-2">
          <input
            type={col.type === 'number' ? 'number' : 'text'}
            value={draft[col.key] ?? ''}
            onChange={(e) => onChange(col.key, col.type, e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20 transition-all"
          />
        </td>
      ))}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button onClick={onSave} disabled={isSaving} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-50">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onCancel} disabled={isSaving} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
