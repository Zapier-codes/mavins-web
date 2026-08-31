ALTER TABLE track_campaigns ADD COLUMN IF NOT EXISTS coverart TEXT;
CREATE INDEX IF NOT EXISTS idx_track_campaigns_coverart ON track_campaigns(coverart) WHERE coverart IS NOT NULL;
