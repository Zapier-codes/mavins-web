'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Percent, AlertTriangle } from 'lucide-react';

/**
 * Task 46b-d (handover.md).
 *
 * Stage 1 (read-only display) and stage 2 (this edit) were built and
 * reviewed as separate stages this session given this whole task's
 * own explicit framing of 46b as "the single highest-stakes part of
 * this whole task" — a wrong write here changes real money on every
 * transaction from that moment forward, for every user, silently,
 * until someone notices.
 *
 * Stage 2 — the actual edit form. Implements the product owner's own
 * confirmed UX decision (handover.md's "Confirmed decisions" note):
 * type-to-confirm, not re-authentication. Each of the two fee
 * percentages is edited independently: a draft input, and — only once
 * that draft genuinely differs from the current persisted value — a
 * second field the admin must type the new number into, exactly,
 * before Save enables. Both percentages are always sent together on
 * Save (POST /api/admin/fees requires both — see that route's own
 * header comment); editing only one field re-submits the other's
 * current value unchanged, which produces a legitimate new
 * append-only row (46b-a's design) rather than a special "partial
 * update" case to avoid.
 */

export interface FeeSettingsRow {
  id: string;
  campaign_fee_percent: number;
  deposit_fee_percent: number;
  changed_by: string | null;
  changed_at: string;
}

export interface FeeSettingsPanelProps {
  feeSettings: FeeSettingsRow | null;
  isLoading: boolean;
  onSave: (input: { campaignFeePercent: number; depositFeePercent: number }) => Promise<{ success: boolean; error?: string }>;
}

function parsePercent(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function FeeSettingsPanel({ feeSettings, isLoading, onSave }: FeeSettingsPanelProps) {
  const [campaignDraft, setCampaignDraft] = useState('');
  const [depositDraft, setDepositDraft] = useState('');
  const [campaignConfirm, setCampaignConfirm] = useState('');
  const [depositConfirm, setDepositConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drafts reset to match whatever's actually persisted whenever the
  // underlying row genuinely changes (a new row landing after a
  // successful save, or the initial load) — keyed on `id` specifically
  // rather than the percentages themselves, so an admin's in-progress,
  // not-yet-saved edit is never silently overwritten by e.g. a
  // background refetch of the SAME still-current row.
  useEffect(() => {
    if (!feeSettings) return;
    setCampaignDraft(String(feeSettings.campaign_fee_percent));
    setDepositDraft(String(feeSettings.deposit_fee_percent));
    setCampaignConfirm('');
    setDepositConfirm('');
    setError(null);
  }, [feeSettings?.id]);

  if (isLoading) {
    return (
      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="px-4 py-8 text-center text-[var(--subtle-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin inline" />
        </div>
      </div>
    );
  }

  if (!feeSettings) {
    return (
      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="px-4 py-8 text-center text-[var(--subtle-foreground)] text-sm">
          No fee settings found — migration 014 may not be applied to this environment yet.
        </div>
      </div>
    );
  }

  const campaignParsed = parsePercent(campaignDraft);
  const depositParsed = parsePercent(depositDraft);
  const campaignChanged = campaignParsed !== null && campaignParsed !== feeSettings.campaign_fee_percent;
  const depositChanged = depositParsed !== null && depositParsed !== feeSettings.deposit_fee_percent;
  const anyChanged = campaignChanged || depositChanged;

  // Exact-match, not "close enough" — same as AWS's own resource-
  // deletion type-to-confirm, the pattern this UX was explicitly
  // modeled on (handover.md's own note). A typo in the confirm field
  // should never accidentally pass.
  const campaignConfirmed = !campaignChanged || (campaignConfirm.trim() !== '' && Number(campaignConfirm) === campaignParsed);
  const depositConfirmed = !depositChanged || (depositConfirm.trim() !== '' && Number(depositConfirm) === depositParsed);

  const campaignInvalid = campaignDraft.trim() !== '' && campaignParsed === null;
  const depositInvalid = depositDraft.trim() !== '' && depositParsed === null;

  const canSave = anyChanged && campaignParsed !== null && depositParsed !== null && campaignConfirmed && depositConfirmed && !saving;

  async function handleSave() {
    if (!canSave || campaignParsed === null || depositParsed === null) return;
    setSaving(true);
    setError(null);
    const result = await onSave({ campaignFeePercent: campaignParsed, depositFeePercent: depositParsed });
    setSaving(false);
    if (!result.success) setError(result.error || 'Failed to save');
    // On success, the parent's reload (after onSave resolves) brings a
    // new `feeSettings.id` -- the useEffect above resets drafts/confirm
    // fields from that, not this handler directly.
  }

  return (
    <div className="glass-strong rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Percent className="w-4 h-4 text-[#1db954]" />
          Platform Fees
        </h3>
        {/* Task 46's own "Confirmed decisions" note (handover.md): fee
            changes are forward-only, never retroactive -- a campaign's
            price is locked in at creation (Task 35), so this only ever
            affects campaigns created after a change lands. Surfaced
            here so an editing admin sees it every time, not just once
            in a tooltip. */}
        <p className="text-[11px] text-[var(--subtle-foreground)] mt-1">
          Changes apply only to campaigns created after the change — already-active campaigns keep the rate they were priced under.
        </p>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FeeField
            label="Campaign Fee"
            draft={campaignDraft}
            onChange={setCampaignDraft}
            invalid={campaignInvalid}
            disabled={saving}
          />
          <FeeField
            label="Deposit Fee"
            draft={depositDraft}
            onChange={setDepositDraft}
            invalid={depositInvalid}
            disabled={saving}
          />
        </div>

        {anyChanged && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                {campaignChanged && campaignParsed !== null && (
                  <p>Changing campaign fee from <strong>{feeSettings.campaign_fee_percent}%</strong> to <strong>{campaignParsed}%</strong>.</p>
                )}
                {depositChanged && depositParsed !== null && (
                  <p>Changing deposit fee from <strong>{feeSettings.deposit_fee_percent}%</strong> to <strong>{depositParsed}%</strong>.</p>
                )}
              </div>
            </div>

            {campaignChanged && campaignParsed !== null && (
              <ConfirmField
                label={`Type ${campaignParsed} to confirm the campaign fee change`}
                value={campaignConfirm}
                onChange={setCampaignConfirm}
                confirmed={campaignConfirmed}
                disabled={saving}
              />
            )}
            {depositChanged && depositParsed !== null && (
              <ConfirmField
                label={`Type ${depositParsed} to confirm the deposit fee change`}
                value={depositConfirm}
                onChange={setDepositConfirm}
                confirmed={depositConfirmed}
                disabled={saving}
              />
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-400">{error}</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-[var(--subtle-foreground)]">
            Last changed {new Date(feeSettings.changed_at).toLocaleString()}.
          </p>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1db954] text-black disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function FeeField({ label, draft, onChange, invalid, disabled }: {
  label: string; draft: string; onChange: (v: string) => void; invalid: boolean; disabled: boolean;
}) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-[11px] text-[var(--subtle-foreground)] mb-1">{label}</div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-lg font-bold focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20 transition-all disabled:opacity-50"
        />
        <span className="text-lg font-bold text-[var(--subtle-foreground)]">%</span>
      </div>
      {invalid && <p className="text-[10px] text-rose-400 mt-1">Must be 0-100</p>}
    </div>
  );
}

function ConfirmField({ label, value, onChange, confirmed, disabled }: {
  label: string; value: string; onChange: (v: string) => void; confirmed: boolean; disabled: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] text-[var(--subtle-foreground)] block mb-1">{label}</label>
      <input
        type="text"
        inputMode="decimal"
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
