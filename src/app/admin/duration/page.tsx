'use client';

// Task 46d (handover.md): split from the old admin/page.tsx monolith's
// 'duration' tab. See pricing/page.tsx's own header comment for why
// each reference-data page owns its own load/refresh logic directly.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { AdminCrudTable } from '@/components/admin/AdminCrudTable';
import { REFERENCE_DATA_QUERY_KEY } from '@/hooks/campaign/useReferenceData';
import {
  type DurationSlotRow,
  DURATION_SLOT_COLUMNS,
  callAdminRoute,
  slotRowToBody,
} from '@/lib/admin/adminHelpers';

export default function AdminDurationPage() {
  const queryClient = useQueryClient();
  const [durationSlots, setDurationSlots] = useState<DurationSlotRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('duration_slots').select('*').order('sort_order');
    if (!error) setDurationSlots(data ?? []);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  async function refreshAfterWrite() {
    await load();
    queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY });
  }

  return (
    <AdminCrudTable<DurationSlotRow>
      title="Duration Slots"
      columns={DURATION_SLOT_COLUMNS}
      rows={durationSlots}
      isLoading={!loaded}
      emptyRow={{ label: '', weeks: 1, days: 7, max_daily_drip: 0, max_views: 0, description: '', badge: '', sort_order: durationSlots.length }}
      onCreate={async (row) => {
        const result = await callAdminRoute('/api/admin/duration-slots', 'POST', slotRowToBody(row));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onUpdate={async (id, updates) => {
        const result = await callAdminRoute('/api/admin/duration-slots', 'PATCH', slotRowToBody({ id, ...updates }));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onDelete={async (id) => {
        const result = await callAdminRoute('/api/admin/duration-slots', 'DELETE', { id });
        if (result.success) await refreshAfterWrite();
        return result;
      }}
    />
  );
}
