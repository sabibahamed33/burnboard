-- BURNBOARD Global Trust & Safety — USER safety settings + 16-category taxonomy
-- NON-DESTRUCTIVE, additive only.

-- ── 1. USER safety settings (USER-only; no account types) ──
CREATE TABLE IF NOT EXISTS user_safety_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  roast_control TEXT NOT NULL DEFAULT 'everyone'
    CHECK (roast_control IN ('everyone', 'people_i_follow', 'followers', 'nobody')),
  comment_control TEXT NOT NULL DEFAULT 'everyone'
    CHECK (comment_control IN ('everyone', 'people_i_follow', 'followers', 'nobody')),
  mention_control TEXT NOT NULL DEFAULT 'everyone'
    CHECK (mention_control IN ('everyone', 'people_i_follow', 'followers', 'nobody')),
  tag_control TEXT NOT NULL DEFAULT 'everyone'
    CHECK (tag_control IN ('everyone', 'people_i_follow', 'followers', 'nobody')),
  message_control TEXT NOT NULL DEFAULT 'everyone'
    CHECK (message_control IN ('everyone', 'people_i_follow', 'followers', 'nobody')),
  hide_sensitive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_safety_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own safety settings" ON user_safety_settings
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users upsert own safety settings" ON user_safety_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own safety settings" ON user_safety_settings
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Expand report target types (photo + dm_message + full content set) ──
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('roast', 'hot_seat', 'battle', 'profile', 'user', 'social_post', 'comment', 'challenge', 'community', 'dm_message', 'photo'));

-- ── 3. Expand report categories to 16-category global taxonomy ──
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_category_check;
ALTER TABLE reports ADD CONSTRAINT reports_category_check
  CHECK (category IN (
    'harassment', 'hate', 'threat', 'sexual_content', 'exploitation',
    'child_safety', 'self_harm', 'spam', 'scam', 'impersonation',
    'privacy_violation', 'personal_info', 'copyright', 'dangerous',
    'manipulation', 'other',
    'non_consensual', 'illegal'
  ));

CREATE INDEX IF NOT EXISTS idx_reports_reporter_created ON reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_settings_updated ON user_safety_settings(updated_at DESC);
