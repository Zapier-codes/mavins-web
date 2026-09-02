-- Migration 010: Task 44 Part 1 -- static campaign data -> Supabase
--
-- Schema + seed only, per this task's own recommended split
-- (handover.md, Task 44): no app code reads these tables yet. That's
-- Part 2 (backend read path + calculatePricing() refactor) and Part 3
-- (frontend wiring to delete the static arrays), both still open.
--
-- Seed data is copied verbatim from the current hardcoded arrays --
-- src/lib/campaign/pricing.ts's PRICING_TIERS/DURATION_SLOTS,
-- src/lib/campaign/geoAffinity.ts's TARGET_COUNTRIES/
-- GENRE_COUNTRY_AFFINITY, and src/app/promote/page.tsx's own GENRES/
-- TIERS -- deliberately not "improved" or renumbered while migrating,
-- per this task's own explicit instruction ("this is a data
-- migration, not a chance to also redesign the actual pricing/
-- country/genre values themselves").
--
-- **Audit finding, carried over from Task 44's own note, NOT resolved
-- here (a values decision, not a schema one):** promote/page.tsx's
-- local `TIERS` array caps its last row at maxViews 5,000,000, while
-- pricing.ts's `PRICING_TIERS` (the actual pricing engine) caps its
-- last row at 10,000,000 -- an existing drift between the two arrays
-- this whole migration exists to make structurally impossible going
-- forward. `pricing_tiers` below seeds `PRICING_TIERS`' number
-- (10,000,000) since that's the one `calculatePricing()` actually
-- computes against -- the one real "products" source of truth. Once
-- Part 3 deletes `promote/page.tsx`'s own `TIERS` array in favor of
-- reading this table, the drift stops being possible by construction,
-- which is arguably the actual fix here -- not picking a "correct"
-- number between two that already disagreed.

-- ------------------------------------------------------------------
-- pricing_tiers -- the "products" table; PRICING_TIERS + TIERS' color
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id TEXT PRIMARY KEY,              -- slug, e.g. 'starter'
  min_views BIGINT NOT NULL,
  max_views BIGINT NOT NULL,
  price_per_1k_cents INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  -- display-only Tailwind gradient, from promote/page.tsx's TIERS
  -- array -- purely presentational, calculatePricing() never reads it
  color TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.pricing_tiers (id, min_views, max_views, price_per_1k_cents, label, description, color, sort_order) VALUES
  ('starter',    1000,       10000,      350, 'Starter',    'Entry-level push',      'from-emerald-500 to-teal-500',   1),
  ('growth',     10001,      50000,      280, 'Growth',     'Building momentum',     'from-blue-500 to-cyan-500',      2),
  ('scale',      50001,      100000,     220, 'Scale',      'Serious traction',      'from-violet-500 to-purple-500',  3),
  ('pro',        100001,     500000,     180, 'Pro',        'Chart contender',       'from-amber-500 to-orange-500',   4),
  ('enterprise', 500001,     1000000,    150, 'Enterprise', 'Viral potential',       'from-rose-500 to-pink-500',      5),
  ('legend',     1000001,    10000000,   120, 'Legend',     'Global domination',     'from-red-500 to-rose-600',       6)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------
-- duration_slots -- DURATION_SLOTS, verbatim
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.duration_slots (
  id TEXT PRIMARY KEY,              -- e.g. '1w'
  label TEXT NOT NULL,
  weeks INTEGER NOT NULL,
  days INTEGER NOT NULL,
  max_daily_drip INTEGER NOT NULL,
  max_views BIGINT NOT NULL,
  description TEXT NOT NULL,
  badge TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.duration_slots (id, label, weeks, days, max_daily_drip, max_views, description, badge, sort_order) VALUES
  ('1w',  '1 Week',    1,  7,   1500, 10500,  'Fast burst campaign',        'Quick',    1),
  ('2w',  '2 Weeks',   2,  14,  1500, 21000,  'Steady growth curve',        'Standard', 2),
  ('4w',  '1 Month',   4,  28,  1500, 42000,  'Natural organic feel',       'Popular',  3),
  ('16w', '4 Months',  16, 112, 1500, 168000, 'Sustained long-term push',   'Serious',  4),
  ('32w', '8 Months',  32, 224, 1500, 336000, 'Maximum reach campaign',     'Legend',   5)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------
-- countries -- TARGET_COUNTRIES, verbatim, all 25 rows
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.countries (
  code TEXT PRIMARY KEY,            -- ISO 3166-1 alpha-2
  country TEXT NOT NULL,
  flag TEXT NOT NULL,               -- emoji flag, as displayed today
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.countries (code, country, flag, sort_order) VALUES
  ('NG', 'Nigeria',              '🇳🇬', 1),
  ('GH', 'Ghana',                '🇬🇭', 2),
  ('ZA', 'South Africa',         '🇿🇦', 3),
  ('KE', 'Kenya',                '🇰🇪', 4),
  ('US', 'United States',        '🇺🇸', 5),
  ('GB', 'United Kingdom',       '🇬🇧', 6),
  ('FR', 'France',               '🇫🇷', 7),
  ('DE', 'Germany',              '🇩🇪', 8),
  ('IN', 'India',                '🇮🇳', 9),
  ('BR', 'Brazil',               '🇧🇷', 10),
  ('JM', 'Jamaica',              '🇯🇲', 11),
  ('CA', 'Canada',               '🇨🇦', 12),
  ('AE', 'United Arab Emirates', '🇦🇪', 13),
  ('NL', 'Netherlands',          '🇳🇱', 14),
  ('CI', 'Côte d''Ivoire',       '🇨🇮', 15),
  ('SN', 'Senegal',              '🇸🇳', 16),
  ('TZ', 'Tanzania',             '🇹🇿', 17),
  ('UG', 'Uganda',               '🇺🇬', 18),
  ('EG', 'Egypt',                '🇪🇬', 19),
  ('MX', 'Mexico',               '🇲🇽', 20),
  ('ES', 'Spain',                '🇪🇸', 21),
  ('IT', 'Italy',                '🇮🇹', 22),
  ('AU', 'Australia',            '🇦🇺', 23),
  ('SE', 'Sweden',               '🇸🇪', 24),
  ('KR', 'South Korea',          '🇰🇷', 25)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------
-- genres -- GENRES (promote/page.tsx), verbatim, all 14 rows.
-- Currently just a flat string list in app code -- kept minimal here
-- too (id/label only) rather than inventing fields nothing reads yet;
-- Task 44's own note left "does this need to be more than {id, label}"
-- as an open question, not something to resolve unilaterally here.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.genres (
  id TEXT PRIMARY KEY,              -- matches the exact string used
                                     -- as the affinity table's key
                                     -- today (e.g. 'Hip-Hop', 'R&B')
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.genres (id, label, sort_order) VALUES
  ('Afrobeats',    'Afrobeats',    1),
  ('Amapiano',     'Amapiano',     2),
  ('Hip-Hop',      'Hip-Hop',      3),
  ('R&B',          'R&B',          4),
  ('Pop',          'Pop',          5),
  ('Electronic',   'Electronic',   6),
  ('Reggae',       'Reggae',       7),
  ('Gospel',       'Gospel',       8),
  ('Highlife',     'Highlife',     9),
  ('Jazz',         'Jazz',         10),
  ('Rock',         'Rock',         11),
  ('Afro-fusion',  'Afro-fusion',  12),
  ('Drill',        'Drill',        13),
  ('Dancehall',    'Dancehall',    14)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------
-- genre_country_affinity -- GENRE_COUNTRY_AFFINITY, unrolled from
-- nested-object-literal into rows: one row per (genre, country) pair
-- that had an explicit score in the source table. Every genre in this
-- session's audit had an entry for all 25 countries, so this is
-- 14 x 25 = 350 rows -- verified by the row-count check at the bottom
-- of this migration, not just assumed.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.genre_country_affinity (
  genre_id TEXT NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
  PRIMARY KEY (genre_id, country_code)
);

INSERT INTO public.genre_country_affinity (genre_id, country_code, score) VALUES
  ('Afrobeats','NG',98),('Afrobeats','GH',88),('Afrobeats','GB',72),('Afrobeats','US',60),('Afrobeats','ZA',55),('Afrobeats','KE',50),('Afrobeats','FR',40),('Afrobeats','CA',42),('Afrobeats','AE',38),('Afrobeats','NL',35),('Afrobeats','BR',25),('Afrobeats','IN',15),('Afrobeats','DE',30),('Afrobeats','JM',45),('Afrobeats','CI',55),('Afrobeats','SN',50),('Afrobeats','TZ',35),('Afrobeats','UG',38),('Afrobeats','EG',20),('Afrobeats','MX',20),('Afrobeats','ES',22),('Afrobeats','IT',20),('Afrobeats','AU',30),('Afrobeats','SE',18),('Afrobeats','KR',12),
  ('Amapiano','ZA',97),('Amapiano','NG',70),('Amapiano','GH',45),('Amapiano','GB',50),('Amapiano','US',38),('Amapiano','KE',40),('Amapiano','NL',30),('Amapiano','FR',25),('Amapiano','CA',28),('Amapiano','AE',30),('Amapiano','BR',15),('Amapiano','IN',10),('Amapiano','DE',22),('Amapiano','JM',20),('Amapiano','CI',30),('Amapiano','SN',25),('Amapiano','TZ',45),('Amapiano','UG',40),('Amapiano','EG',15),('Amapiano','MX',12),('Amapiano','ES',15),('Amapiano','IT',12),('Amapiano','AU',22),('Amapiano','SE',15),('Amapiano','KR',8),
  ('Hip-Hop','US',95),('Hip-Hop','GB',70),('Hip-Hop','CA',68),('Hip-Hop','FR',55),('Hip-Hop','DE',45),('Hip-Hop','NG',60),('Hip-Hop','ZA',45),('Hip-Hop','JM',40),('Hip-Hop','AE',35),('Hip-Hop','NL',40),('Hip-Hop','BR',42),('Hip-Hop','IN',30),('Hip-Hop','GH',40),('Hip-Hop','KE',32),('Hip-Hop','CI',35),('Hip-Hop','SN',30),('Hip-Hop','TZ',30),('Hip-Hop','UG',28),('Hip-Hop','EG',25),('Hip-Hop','MX',45),('Hip-Hop','ES',40),('Hip-Hop','IT',42),('Hip-Hop','AU',55),('Hip-Hop','SE',40),('Hip-Hop','KR',50),
  ('R&B','US',92),('R&B','GB',65),('R&B','CA',60),('R&B','NG',55),('R&B','GH',40),('R&B','ZA',42),('R&B','FR',35),('R&B','DE',30),('R&B','JM',38),('R&B','AE',25),('R&B','NL',30),('R&B','BR',25),('R&B','IN',18),('R&B','KE',28),('R&B','CI',25),('R&B','SN',22),('R&B','TZ',22),('R&B','UG',20),('R&B','EG',20),('R&B','MX',30),('R&B','ES',28),('R&B','IT',25),('R&B','AU',45),('R&B','SE',35),('R&B','KR',40),
  ('Pop','US',90),('Pop','GB',80),('Pop','DE',55),('Pop','FR',55),('Pop','CA',60),('Pop','NL',50),('Pop','BR',50),('Pop','IN',45),('Pop','AE',40),('Pop','NG',42),('Pop','ZA',40),('Pop','KE',30),('Pop','GH',30),('Pop','JM',25),('Pop','CI',30),('Pop','SN',28),('Pop','TZ',25),('Pop','UG',22),('Pop','EG',35),('Pop','MX',55),('Pop','ES',60),('Pop','IT',58),('Pop','AU',65),('Pop','SE',62),('Pop','KR',55),
  ('Electronic','DE',92),('Electronic','NL',85),('Electronic','GB',65),('Electronic','US',55),('Electronic','FR',55),('Electronic','AE',45),('Electronic','CA',40),('Electronic','ZA',35),('Electronic','BR',40),('Electronic','IN',25),('Electronic','NG',22),('Electronic','GH',15),('Electronic','KE',15),('Electronic','JM',15),('Electronic','CI',18),('Electronic','SN',15),('Electronic','TZ',12),('Electronic','UG',12),('Electronic','EG',25),('Electronic','MX',35),('Electronic','ES',50),('Electronic','IT',45),('Electronic','AU',42),('Electronic','SE',70),('Electronic','KR',35),
  ('Reggae','JM',98),('Reggae','GB',55),('Reggae','US',45),('Reggae','ZA',30),('Reggae','NG',35),('Reggae','GH',30),('Reggae','KE',25),('Reggae','DE',20),('Reggae','FR',20),('Reggae','NL',25),('Reggae','CA',30),('Reggae','AE',15),('Reggae','IN',10),('Reggae','BR',20),('Reggae','CI',20),('Reggae','SN',18),('Reggae','TZ',15),('Reggae','UG',12),('Reggae','EG',10),('Reggae','MX',25),('Reggae','ES',22),('Reggae','IT',20),('Reggae','AU',25),('Reggae','SE',15),('Reggae','KR',8),
  ('Gospel','NG',90),('Gospel','US',70),('Gospel','KE',65),('Gospel','GH',60),('Gospel','ZA',55),('Gospel','GB',35),('Gospel','CA',30),('Gospel','DE',12),('Gospel','FR',12),('Gospel','NL',15),('Gospel','AE',20),('Gospel','BR',25),('Gospel','IN',20),('Gospel','JM',30),('Gospel','CI',30),('Gospel','SN',20),('Gospel','TZ',40),('Gospel','UG',45),('Gospel','EG',15),('Gospel','MX',20),('Gospel','ES',10),('Gospel','IT',10),('Gospel','AU',20),('Gospel','SE',10),('Gospel','KR',15),
  ('Highlife','GH',95),('Highlife','NG',75),('Highlife','GB',30),('Highlife','US',20),('Highlife','ZA',15),('Highlife','KE',15),('Highlife','CA',18),('Highlife','DE',10),('Highlife','FR',10),('Highlife','NL',12),('Highlife','AE',10),('Highlife','BR',8),('Highlife','IN',5),('Highlife','JM',15),('Highlife','CI',25),('Highlife','SN',15),('Highlife','TZ',10),('Highlife','UG',10),('Highlife','EG',5),('Highlife','MX',5),('Highlife','ES',5),('Highlife','IT',5),('Highlife','AU',8),('Highlife','SE',5),('Highlife','KR',3),
  ('Jazz','US',80),('Jazz','FR',70),('Jazz','NL',60),('Jazz','GB',55),('Jazz','DE',55),('Jazz','ZA',40),('Jazz','NG',25),('Jazz','GH',20),('Jazz','CA',45),('Jazz','AE',25),('Jazz','BR',45),('Jazz','IN',20),('Jazz','KE',18),('Jazz','JM',20),('Jazz','CI',20),('Jazz','SN',25),('Jazz','TZ',15),('Jazz','UG',12),('Jazz','EG',20),('Jazz','MX',25),('Jazz','ES',30),('Jazz','IT',35),('Jazz','AU',35),('Jazz','SE',30),('Jazz','KR',20),
  ('Rock','US',78),('Rock','GB',78),('Rock','DE',65),('Rock','FR',50),('Rock','CA',60),('Rock','NL',45),('Rock','BR',50),('Rock','IN',30),('Rock','ZA',35),('Rock','NG',20),('Rock','GH',15),('Rock','KE',18),('Rock','AE',20),('Rock','JM',15),('Rock','CI',12),('Rock','SN',10),('Rock','TZ',10),('Rock','UG',10),('Rock','EG',15),('Rock','MX',40),('Rock','ES',35),('Rock','IT',40),('Rock','AU',55),('Rock','SE',45),('Rock','KR',30),
  ('Afro-fusion','NG',92),('Afro-fusion','GB',65),('Afro-fusion','US',55),('Afro-fusion','GH',60),('Afro-fusion','ZA',48),('Afro-fusion','KE',42),('Afro-fusion','CA',35),('Afro-fusion','FR',30),('Afro-fusion','DE',25),('Afro-fusion','NL',28),('Afro-fusion','AE',30),('Afro-fusion','BR',20),('Afro-fusion','IN',15),('Afro-fusion','JM',30),('Afro-fusion','CI',40),('Afro-fusion','SN',35),('Afro-fusion','TZ',30),('Afro-fusion','UG',32),('Afro-fusion','EG',18),('Afro-fusion','MX',20),('Afro-fusion','ES',22),('Afro-fusion','IT',20),('Afro-fusion','AU',28),('Afro-fusion','SE',18),('Afro-fusion','KR',12),
  ('Drill','GB',85),('Drill','US',78),('Drill','NG',55),('Drill','FR',45),('Drill','CA',40),('Drill','DE',25),('Drill','ZA',25),('Drill','GH',30),('Drill','NL',25),('Drill','AE',15),('Drill','BR',15),('Drill','IN',10),('Drill','KE',15),('Drill','JM',20),('Drill','CI',15),('Drill','SN',12),('Drill','TZ',10),('Drill','UG',10),('Drill','EG',10),('Drill','MX',20),('Drill','ES',25),('Drill','IT',22),('Drill','AU',30),('Drill','SE',25),('Drill','KR',20),
  ('Dancehall','JM',96),('Dancehall','GB',50),('Dancehall','US',45),('Dancehall','NG',40),('Dancehall','GH',35),('Dancehall','ZA',25),('Dancehall','CA',35),('Dancehall','DE',15),('Dancehall','FR',18),('Dancehall','NL',20),('Dancehall','AE',15),('Dancehall','BR',22),('Dancehall','IN',10),('Dancehall','KE',20),('Dancehall','CI',18),('Dancehall','SN',15),('Dancehall','TZ',12),('Dancehall','UG',10),('Dancehall','EG',8),('Dancehall','MX',22),('Dancehall','ES',20),('Dancehall','IT',18),('Dancehall','AU',25),('Dancehall','SE',15),('Dancehall','KR',10)
ON CONFLICT (genre_id, country_code) DO NOTHING;

-- Sanity check: every genre must have exactly 25 affinity rows (one
-- per country) -- catches a copy-paste row/column slip in the bulk
-- INSERT above at migration time rather than silently shipping a
-- genre with a missing country score. Fails the whole migration
-- (ROLLBACK) if it doesn't hold, rather than a future Part 2/3 session
-- discovering a gap indirectly.
DO $$
DECLARE
  bad_genre TEXT;
  bad_count INTEGER;
BEGIN
  SELECT genre_id, COUNT(*) INTO bad_genre, bad_count
  FROM public.genre_country_affinity
  GROUP BY genre_id
  HAVING COUNT(*) <> 25
  LIMIT 1;

  IF bad_genre IS NOT NULL THEN
    RAISE EXCEPTION 'genre_country_affinity: genre % has % rows, expected 25 -- seed data is incomplete, check the INSERT above', bad_genre, bad_count;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- RLS -- all five tables are public, non-sensitive reference data
-- (unlike every money-adjacent table elsewhere in this project's
-- migrations) -- public SELECT, no INSERT/UPDATE/DELETE for anon or
-- authenticated. Part 4 (admin-editing UI, still an open question per
-- Task 44's own note) would need its own service-role-gated write
-- path, not a policy change here.
-- ------------------------------------------------------------------
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genre_country_affinity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pricing_tiers" ON public.pricing_tiers FOR SELECT USING (true);
CREATE POLICY "Public read duration_slots" ON public.duration_slots FOR SELECT USING (true);
CREATE POLICY "Public read countries" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Public read genres" ON public.genres FOR SELECT USING (true);
CREATE POLICY "Public read genre_country_affinity" ON public.genre_country_affinity FOR SELECT USING (true);
