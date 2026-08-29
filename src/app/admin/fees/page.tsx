'use client';

// Task 46d (handover.md): split from the old admin/page.tsx monolith's
// 'fees' tab (Task 46b-d). Unlike the five 46a tables, this one goes
// through the admin GET route (Task 46b-c) instead of a direct browser-
// client select — "the current rate" needs an ORDER BY changed_at DESC
// LIMIT 1, which the route already does server-side.

import { useEffect, useState } from 'react';
import { FeeSettingsPanel, type FeeSettingsRow } from '@/components/admin/FeeSettingsPanel';
import { callAdminRoute } from '@/lib/admin/adminHelpers';

export default function AdminFeesPage() {
  const [feeSettings, setFeeSettings] = useState<FeeSettingsRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/fees');
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) setFeeSettings(json.feeSettings ?? null);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  // Task 46b-d, stage 2 — POST /api/admin/fees always expects both
  // percentages together (see that route's own header comment); this
  // page's job is only to relay FeeSettingsPanel's already-confirmed
  // input, not re-derive or re-validate it a second time (the panel's
  // own type-to-confirm gate and the route's own validPercent() are
  // where that already happens).
  async function saveFeeSettings(input: { campaignFeePercent: number; depositFeePercent: number }) {
    const result = await callAdminRoute('/api/admin/fees', 'POST', input);
    if (result.success) await load();
    return result;
  }

  return <FeeSettingsPanel feeSettings={feeSettings} isLoading={!loaded} onSave={saveFeeSettings} />;
}
