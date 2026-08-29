'use client';

import React from 'react';
import { Loader2, Percent } from 'lucide-react';

/**
 * Task 46b-d (handover.md), stage 1 of 3 this session — read-only
 * display only. The type-to-confirm edit form is stage 2, built and
 * reviewed separately given this whole task's own explicit framing
 * of 46b as "the single highest-stakes part of this whole task" (a
 * wrong write here changes real money on every transaction from that
 * moment forward, for every user, silently, until someone notices).
 * Stage 1 carries none of that risk — it only reads from
 * GET /api/admin/fees (Task 46b-c, already shipped).
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
}

export function FeeSettingsPanel({ feeSettings, isLoading }: FeeSettingsPanelProps) {
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

      {isLoading ? (
        <div className="px-4 py-8 text-center text-[var(--subtle-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin inline" />
        </div>
      ) : !feeSettings ? (
        <div className="px-4 py-8 text-center text-[var(--subtle-foreground)] text-sm">
          No fee settings found — migration 014 may not be applied to this environment yet.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card rounded-xl p-3">
              <div className="text-[11px] text-[var(--subtle-foreground)]">Campaign Fee</div>
              <div className="text-xl font-bold">{feeSettings.campaign_fee_percent}%</div>
            </div>
            <div className="glass-card rounded-xl p-3">
              <div className="text-[11px] text-[var(--subtle-foreground)]">Deposit Fee</div>
              <div className="text-xl font-bold">{feeSettings.deposit_fee_percent}%</div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--subtle-foreground)]">
            Last changed {new Date(feeSettings.changed_at).toLocaleString()}.
          </p>
        </div>
      )}
    </div>
  );
}
