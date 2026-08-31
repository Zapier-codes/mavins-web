CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit integer DEFAULT 50)
 RETURNS TABLE(
   artist_id uuid, artist_name text, total_streams bigint,
   total_campaigns bigint, avatar_url text, coverart text,
   estimated_revenue_cents bigint, listen_earn_cents bigint, songs_per_day bigint
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    SELECT
        u.id AS artist_id,
        COALESCE(u.artist_name, u.display_name, split_part(u.email, '@', 1)) AS artist_name,
        COALESCE(SUM(tc.total_streams), 0)::BIGINT AS total_streams,
        COALESCE(COUNT(tc.id), 0)::BIGINT AS total_campaigns,
        u.avatar_url,
        COALESCE(
            (SELECT tc2.coverart FROM track_campaigns tc2 
             WHERE tc2.artist_id = u.id AND tc2.coverart IS NOT NULL 
             ORDER BY tc2.created_at DESC LIMIT 1),
            u.avatar_url
        ) AS coverart,
        COALESCE(FLOOR(SUM(tc.total_streams) * 0.4), 0)::BIGINT AS estimated_revenue_cents,
        COALESCE(FLOOR(SUM(tc.total_streams) * 0.12), 0)::BIGINT AS listen_earn_cents,
        GREATEST(5, COALESCE(
            FLOOR(SUM(tc.total_streams) / NULLIF(GREATEST(1, EXTRACT(DAY FROM (NOW() - MIN(tc.created_at)))), 0)),
            5
        ))::BIGINT AS songs_per_day
    FROM public.users u
    LEFT JOIN public.track_campaigns tc ON tc.artist_id = u.id AND tc.is_active = true
    WHERE u.is_active = true
    GROUP BY u.id, u.artist_name, u.display_name, u.email, u.avatar_url
    ORDER BY total_streams DESC, u.created_at ASC
    LIMIT p_limit;
$function$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer) TO authenticated;
