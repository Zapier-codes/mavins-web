'use client';

// Task 46d (handover.md): split from the old admin/page.tsx monolith's
// 'pricing' tab. Unlike Overview/Campaigns/Users/Ledger, this page
// (and duration/countries/genres/affinity/fees below) owns its own
// table's load + refresh logic directly rather than through a shared
// hook — in the old monolith these were one giant component's
// closures over shared state; here each page only ever needs its own
// table, so there's nothing left to usefully share across them beyond
// what's already in adminHelpers.ts (types/columns/mappers/
// callAdminRoute).

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { AdminCrudTable } from '@/components/admin/AdminCrudTable';
import { REFERENCE_DATA_QUERY_KEY } from '@/hooks/campaign/useReferenceData';
import {
  type PricingTierRow,
  PRICING_TIER_COLUMNS,
  callAdminRoute,
  tierRowToBody,
} from '@/lib/admin/adminHelpers';

export default function AdminPricingPage() {
  const queryClient = useQueryClient();
  const [pricingTiers, setPricingTiers] = useState<PricingTierRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('pricing_tiers').select('*').order('sort_order');
    if (!error) setPricingTiers(data ?? []);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  // Task 46a's own explicit integration requirement (handover.md):
  // after any successful write, re-read this page's own local copy AND
  // invalidate Task 45 Part 2's shared reference-data query key, so
  // promote/page.tsx's live pricing picks up the change without a
  // manual refresh.
  async function refreshAfterWrite() {
    await load();
    queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY });
  }

  return (
    <AdminCrudTable<PricingTierRow>
      title="Pricing Tiers"
      columns={PRICING_TIER_COLUMNS}
      rows={pricingTiers}
      isLoading={!loaded}
      emptyRow={{ min_views: 0, max_views: 0, price_per_1k_cents: 0, label: '', description: '', color: null, sort_order: pricingTiers.length }}
      onCreate={async (row) => {
        const result = await callAdminRoute('/api/admin/pricing-tiers', 'POST', tierRowToBody(row));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onUpdate={async (id, updates) => {
        const result = await callAdminRoute('/api/admin/pricing-tiers', 'PATCH', tierRowToBody({ id, ...updates }));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onDelete={async (id) => {
        const result = await callAdminRoute('/api/admin/pricing-tiers', 'DELETE', { id });
        if (result.success) await refreshAfterWrite();
        return result;
      }}
    />
  );
}
