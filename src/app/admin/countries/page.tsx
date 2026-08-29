'use client';

// Task 46d (handover.md): split from the old admin/page.tsx monolith's
// 'countries' tab (Task 46a Part B-i). See pricing/page.tsx's own
// header comment for why each reference-data page owns its own
// load/refresh logic directly.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { AdminCrudTable } from '@/components/admin/AdminCrudTable';
import { REFERENCE_DATA_QUERY_KEY } from '@/hooks/campaign/useReferenceData';
import {
  type CountryRow,
  COUNTRY_COLUMNS,
  CASCADE_DELETE_WARNING,
  callAdminRoute,
  countryRowToBody,
} from '@/lib/admin/adminHelpers';

export default function AdminCountriesPage() {
  const queryClient = useQueryClient();
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('countries').select('*').order('sort_order');
    if (!error) setCountries(data ?? []);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  async function refreshAfterWrite() {
    await load();
    queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY });
  }

  return (
    <AdminCrudTable<CountryRow>
      title="Countries"
      columns={COUNTRY_COLUMNS}
      rows={countries}
      isLoading={!loaded}
      idKey="code"
      deleteWarning={CASCADE_DELETE_WARNING}
      emptyRow={{ code: '', country: '', flag: '', sort_order: countries.length, korapay_channels: null, korapay_default_channel: null }}
      onCreate={async (row) => {
        const result = await callAdminRoute('/api/admin/countries', 'POST', countryRowToBody(row));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onUpdate={async (code, updates) => {
        const result = await callAdminRoute('/api/admin/countries', 'PATCH', countryRowToBody({ code, ...updates }));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onDelete={async (code) => {
        const result = await callAdminRoute('/api/admin/countries', 'DELETE', { code });
        if (result.success) await refreshAfterWrite();
        return result;
      }}
    />
  );
}
