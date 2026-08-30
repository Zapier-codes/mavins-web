'use client';

import React from 'react';

/**
 * Task 46e (handover.md) — the confirmation-dialogs pattern that
 * section's own status note flagged as the one remaining piece:
 * "46b's fee-change UI has its own type-to-confirm pattern already,
 * but nothing shared exists yet for 46a/46c's own higher-stakes
 * actions." Extracted from `FeeSettingsPanel.tsx`'s private
 * `ConfirmField` (that component now imports this instead — zero
 * behavior change there, confirmed by diff) and generalized so
 * `admin/campaigns/page.tsx`'s view-count override — 46e's own other
 * named example ("overriding a live campaign's view count") — can use
 * the exact same gate rather than inventing a second copy.
 *
 * Exact-match, not "close enough" — same AWS-resource-deletion
 * type-to-confirm this was originally modeled on (handover.md's own
 * note). A typo in the confirm field should never accidentally pass.
 *
 * Deliberately NOT a modal/portal — every existing use of this pattern
 * in this app (fee changes, now this) is an inline confirm step within
 * an already-open edit form, not a separate dialog layered on top. If
 * a future caller genuinely needs a modal wrapper, that's a different,
 * additive component to build around this one, not a reason to change
 * this one's shape.
 */

export interface TypeToConfirmProps {
  /** What the admin must type, exactly, to enable the action this
   * gates — usually the new value itself (a number, a percent), so the
   * act of confirming doubles as a final "did I mean to type that"
   * check, not just a rote ritual. */
  expectedValue: string | number;
  /** Field label, e.g. "Type 45000 to confirm the new view count". */
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

/** Whether `raw` matches `expectedValue` closely enough to confirm.
 * Numeric-aware (so "45000" confirms `45000` the number, not just the
 * string "45000") but still exact — no rounding/fuzzy tolerance. */
export function isConfirmed(raw: string, expectedValue: string | number): boolean {
  if (raw.trim() === '') return false;
  if (typeof expectedValue === 'number') return Number(raw) === expectedValue;
  return raw === expectedValue;
}

export function TypeToConfirm({ expectedValue, label, value, onChange, disabled }: TypeToConfirmProps) {
  const confirmed = isConfirmed(value, expectedValue);
  return (
    <div>
      <label className="text-[11px] text-[var(--subtle-foreground)] block mb-1">{label}</label>
      <input
        type="text"
        inputMode={typeof expectedValue === 'number' ? 'decimal' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg bg-white/5 border text-sm transition-all disabled:opacity-50 ${
          value !== '' && confirmed ? 'border-emerald-500/50' : 'border-white/10 focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20'
        }`}
      />
    </div>
  );
}
