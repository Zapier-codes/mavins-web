'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react';

/**
 * Task 46a (handover.md) — UI half. Built in Part A of this session's
 * own split scoped to `pricing_tiers`/`duration_slots` (single string
 * `id` PK, every field a flat scalar). Generalized in Part B-i (a
 * further split of the original Part B — see handover.md, Task 46a's
 * own entry, for the full A/B/B-i/B-ii reasoning) to also cover
 * `countries` (keyed on `code`, not `id` — see the new `idKey` prop)
 * and `genres` (fits the original shape directly, `id`-keyed, just not
 * reached in Part A). Two additions made specifically for that:
 *   - `idKey` — which field is this row's primary key. Defaults to
 *     `'id'` (Part A's two tables, and `genres`, all still work
 *     unchanged); `countries`' tab passes `idKey="code"`.
 *   - `'text-array'` column type — comma-separated editing for
 *     `countries.korapay_channels` (a real `string[] | null` DB
 *     column, migration 012). Draft state keeps this field as a raw
 *     string the whole time it's being edited (never round-tripped
 *     through an array mid-keystroke) specifically so typing a
 *     trailing comma to start the next item doesn't get silently
 *     collapsed away by a naive split-and-rejoin on every keystroke —
 *     conversion to/from the real array only happens once, at
 *     edit-start (array → string) and at save (string → array).
 *   - `deleteWarning` — optional extra copy shown in the delete-
 *     confirm step. Used by both `countries` and `genres` (deleting
 *     either cascades into `genre_country_affinity` via migration
 *     010's own FK — a real, non-obvious side effect this task's own
 *     backend-half note already flagged as needing a UI warning).
 *
 * Still NOT designed for `genre_country_affinity` (composite
 * `(genre_id, country_code)` key, 350 rows, upsert-not-strict-create
 * semantics) — that's Part B-ii, deliberately not attempted here; a
 * filterable matrix/grid is a different enough shape that forcing it
 * through this same list-of-rows component would be the wrong fit, not
 * a shortcut.
 */

export interface AdminCrudColumn<T> {
  key: keyof T & string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'text-array';
  /** Shown in the table as a plain column; omit to keep a field
   * edit-only (rare for this component's two current use cases, but
   * available). */
  hideInTable?: boolean;
}

export interface AdminCrudTableProps<T extends Record<string, any>> {
  title: string;
  columns: AdminCrudColumn<T>[];
  rows: T[];
  isLoading: boolean;
  /** Row shape for a brand-new entry before the admin fills anything
   * in — every column should have a reasonable starting value here
   * (empty string / 0 / null for a text-array column), since this
   * component doesn't know your business defaults. */
  emptyRow: Record<string, any>;
  /** Which field is this row's primary key. Defaults to `'id'`
   * (Part A's two tables, and `genres`) — `countries` passes
   * `idKey="code"`. */
  idKey?: keyof T & string;
  /** Extra copy shown in the delete-confirm step, e.g. a cascade-delete
   * warning. Omit for a plain "Delete?" prompt. */
  deleteWarning?: string;
  onCreate: (row: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
  onUpdate: (id: string, updates: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
}

function toDraftValue(type: AdminCrudColumn<any>['type'], value: any): any {
  if (type === 'text-array') return Array.isArray(value) ? value.join(', ') : (value ?? '');
  return value;
}

function fromDraftValue(type: AdminCrudColumn<any>['type'], value: any): any {
  if (type === 'text-array') {
    const arr = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  return value;
}

export function AdminCrudTable<T extends Record<string, any>>({
  title,
  columns,
  rows,
  isLoading,
  emptyRow,
  idKey = 'id' as keyof T & string,
  deleteWarning,
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
    setEditingId(String(row[idKey]));
    const d: Record<string, any> = {};
    for (const col of columns) d[col.key] = toDraftValue(col.type, row[col.key]);
    setDraft(d);
    setIsCreating(false);
  }

  function startCreate() {
    setRowError(null);
    setIsCreating(true);
    setEditingId(null);
    const d: Record<string, any> = {};
    for (const col of columns) d[col.key] = toDraftValue(col.type, emptyRow[col.key]);
    setDraft(d);
  }

  function cancel() {
    setEditingId(null);
    setIsCreating(false);
    setDraft({});
    setRowError(null);
  }

  function updateDraftField(key: string, type: AdminCrudColumn<T>['type'], value: string) {
    // text-array deliberately stays a raw string in draft the whole
    // time it's being edited — see this file's header comment for why
    // (a naive split/rejoin on every keystroke would eat a trailing
    // comma the admin just typed to start the next item).
    setDraft((prev) => ({ ...prev, [key]: type === 'number' ? (value === '' ? '' : Number(value)) : value }));
  }

  async function saveCreate() {
    setIsSaving(true);
    setRowError(null);
    const body: Record<string, any> = {};
    for (const col of columns) body[col.key] = fromDraftValue(col.type, draft[col.key]);
    const result = await onCreate(body);
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
    const updates: Record<string, any> = {};
    for (const col of columns) {
      if (col.key === idKey) continue;
      updates[col.key] = fromDraftValue(col.type, draft[col.key]);
    }
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
              rows.map((row) => {
                const rowId = String(row[idKey]);
                return editingId === rowId ? (
                  <EditRow
                    key={rowId}
                    columns={visibleColumns}
                    draft={draft}
                    onChange={updateDraftField}
                    onSave={saveEdit}
                    onCancel={cancel}
                    isSaving={isSaving}
                  />
                ) : (
                  <tr key={rowId} className="border-b border-white/5 hover:bg-white/5">
                    {visibleColumns.map((col) => {
                      const value = row[col.key];
                      const display = col.type === 'text-array' && Array.isArray(value)
                        ? (value.length ? value.join(', ') : '—')
                        : String(value ?? '—');
                      return (
                        <td key={col.key} className="px-4 py-3 max-w-xs truncate">{display}</td>
                      );
                    })}
                    <td className="px-4 py-3">
                      {pendingDeleteId === rowId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-rose-400">{deleteWarning || 'Delete?'}</span>
                          <button onClick={() => confirmDelete(rowId)} disabled={isSaving} className="p-1 rounded hover:bg-rose-500/20 text-rose-400 flex-shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPendingDeleteId(null)} className="p-1 rounded hover:bg-white/10 flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(row)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPendingDeleteId(rowId)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-rose-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
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
            placeholder={col.type === 'text-array' ? 'comma, separated, values' : undefined}
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
