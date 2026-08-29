'use client';

// Task 46d (handover.md): split from the old admin/page.tsx monolith's
// 'genres' tab (Task 46a Part B-i). See pricing/page.tsx's own header
// comment for why each reference-data page owns its own load/refresh
// logic directly.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { AdminCrudTable } from '@/components/admin/AdminCrudTable';
import { REFERENCE_DATA_QUERY_KEY } from '@/hooks/campaign/useReferenceData';
import {
  type GenreRow,
  GENRE_COLUMNS,
  CASCADE_DELETE_WARNING,
  callAdminRoute,
  genreRowToBody,
} from '@/lib/admin/adminHelpers';

export default function AdminGenresPage() {
  const queryClient = useQueryClient();
  const [genres, setGenres] = useState<GenreRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('genres').select('*').order('sort_order');
    if (!error) setGenres(data ?? []);
    setLoaded(true);
  }

  useEffect(() => { load(); }, []);

  async function refreshAfterWrite() {
    await load();
    queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY });
  }

  return (
    <AdminCrudTable<GenreRow>
      title="Genres"
      columns={GENRE_COLUMNS}
      rows={genres}
      isLoading={!loaded}
      deleteWarning={CASCADE_DELETE_WARNING}
      emptyRow={{ label: '', sort_order: genres.length }}
      onCreate={async (row) => {
        const result = await callAdminRoute('/api/admin/genres', 'POST', genreRowToBody(row));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onUpdate={async (id, updates) => {
        const result = await callAdminRoute('/api/admin/genres', 'PATCH', genreRowToBody({ id, ...updates }));
        if (result.success) await refreshAfterWrite();
        return result;
      }}
      onDelete={async (id) => {
        const result = await callAdminRoute('/api/admin/genres', 'DELETE', { id });
        if (result.success) await refreshAfterWrite();
        return result;
      }}
    />
  );
}
