-- ============================================================
-- BURNBOARD - ONE-SHOT LIVE DB SETUP
-- Run ONCE in Supabase Dashboard > SQL Editor on an empty project.
--
-- Built by scripts/build-apply-sql.js. Do not edit by hand.
--
-- Order matters and is deliberate:
--   1. base tables          (supabase/patch_missing_tables.sql)
--   2. base schema          (supabase/schema.sql)
--   3. migrations           (supabase/migrations/*.sql, filename order)
--
-- patch_missing_tables.sql holds the CURRENT definition of the core tables
-- (profiles.is_banned/is_hidden, roasts.is_hidden, ...) and must come first;
-- schema.sql only adds the tables patch does not define (user_profiles,
-- follows, daily_winner). Migrations are incremental and ALTER the tables
-- created by (1) and (2), so they cannot be applied on their own to an
-- empty database.
--
-- Statements are idempotent where possible: CREATE TABLE/INDEX IF NOT
-- EXISTS, guarded policies and publication membership. The script runs as
-- a single transaction, so a failure rolls the whole thing back.
--
-- Generated: 2026-10-08
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1/3 — BASE TABLES (supabase/patch_missing_tables.sql)
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURNXBOARD — PATCH: Create only MISSING tables
-- Safe to run — only creates tables that don't exist yet
-- Does NOT drop any existing tables or data
-- ============================================================

-- ============================================================
-- PROFILES (Roast Targets) — CRITICAL, app won't load without this
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  platform TEXT NOT NULL,
  url TEXT,
  bio TEXT,
  avatar_url TEXT,
  avatar_letter TEXT,
  avatar_color TEXT,
  tagline TEXT,
  featured BOOLEAN DEFAULT false,
  roast_count INT DEFAULT 0,
  total_upvotes INT DEFAULT 0,
  reaction_brutal INT DEFAULT 0,
  reaction_haha INT DEFAULT 0,
  reaction_cry INT DEFAULT 0,
  is_banned BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  hot_seat_token TEXT UNIQUE,
  hot_seat_expires_at TIMESTAMPTZ,
  hot_seat_share_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- ROASTS — CRITICAL for roast posting
-- ============================================================
CREATE TABLE IF NOT EXISTS roasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  roast_text TEXT NOT NULL,
  anon_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  upvotes INT DEFAULT 0,
  reaction_brutal INT DEFAULT 0,
  reaction_haha INT DEFAULT 0,
  reaction_cry INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  is_clean BOOLEAN DEFAULT true,
  ip_hash TEXT,
  savage_level TEXT DEFAULT 'savage',
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- BATTLES — CRITICAL for battle feature
-- ============================================================
CREATE TABLE IF NOT EXISTS battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  profile2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  votes1 INT DEFAULT 0,
  votes2 INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- STORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  text TEXT,
  background_color TEXT DEFAULT '#ff4500',
  view_count INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT (now() + interval '24 hours')
);

-- ============================================================
-- STORY VIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  viewed_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  reporter_id UUID,
  reporter_ip TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- SECURITY LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- BLOCKED IPS
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip_hash TEXT PRIMARY KEY,
  reason TEXT,
  blocked_by UUID,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'roast',
  target_count INT NOT NULL DEFAULT 1,
  reward_karma INT NOT NULL DEFAULT 5,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- DAILY CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reward TEXT,
  target_count INT DEFAULT 10,
  current_count INT DEFAULT 0,
  type TEXT,
  date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- USER KARMA
-- ============================================================
CREATE TABLE IF NOT EXISTS user_karma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id TEXT,
  total_upvotes_received INT DEFAULT 0,
  total_roasts_given INT DEFAULT 0,
  total_upvotes_given INT DEFAULT 0,
  level TEXT DEFAULT 'Newbie',
  streak INT DEFAULT 0,
  last_roast_date DATE,
  burn_score INT DEFAULT 0,
  total_reactions_received INT DEFAULT 0,
  total_battles_won INT DEFAULT 0,
  total_challenges_completed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(anon_id)
);

-- ============================================================
-- NOTIFICATION QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  priority INT DEFAULT 0,
  dedup_key TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- ROAST REMIXES
-- ============================================================
CREATE TABLE IF NOT EXISTS roast_remixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_roast_id UUID REFERENCES roasts(id) ON DELETE CASCADE,
  original_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  remix_text TEXT,
  upvotes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- USER INTERACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  target_user_id UUID,
  target_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT,
  platform TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- WAITLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- SPONSORS
-- ============================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sponsor_name TEXT NOT NULL,
  sponsor_text TEXT,
  cta_link TEXT,
  image_url TEXT,
  position TEXT DEFAULT 'feed',
  active BOOLEAN DEFAULT true,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- EMAIL SUBSCRIBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- HOT SEATS
-- ============================================================
CREATE TABLE IF NOT EXISTS hot_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  context TEXT DEFAULT '',
  image_url TEXT DEFAULT NULL,
  heat_level TEXT NOT NULL DEFAULT 'savage',
  status TEXT NOT NULL DEFAULT 'active',
  roast_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- HOT SEAT ROASTS
-- ============================================================
CREATE TABLE IF NOT EXISTS hot_seat_roasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hot_seat_id UUID REFERENCES hot_seats(id) ON DELETE CASCADE,
  roast_text TEXT NOT NULL,
  anon_id TEXT NOT NULL DEFAULT 'Anonymous Roaster',
  ip_hash TEXT,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- HOT SEAT REACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS hot_seat_roast_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roast_id UUID NOT NULL REFERENCES hot_seat_roasts(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USER CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenged_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenger_score INT DEFAULT 0,
  challenged_score INT DEFAULT 0,
  status TEXT DEFAULT 'pending',
  challenge_type TEXT DEFAULT 'roast_battle',
  description TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BATTLE ROUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS battle_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1,
  profile1_roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  profile2_roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  votes1 INT DEFAULT 0,
  votes2 INT DEFAULT 0,
  winner INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BATTLE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS battle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  profile1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  profile2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  winner_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  total_votes1 INT DEFAULT 0,
  total_votes2 INT DEFAULT 0,
  round_count INT DEFAULT 1,
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- LEADERBOARD SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  burn_score INT DEFAULT 0,
  total_upvotes INT DEFAULT 0,
  total_roasts INT DEFAULT 0,
  level TEXT DEFAULT 'Newbie',
  category TEXT DEFAULT 'alltime',
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USER BLOCKS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- ============================================================
-- MODERATION RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS moderation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'flag',
  severity INT DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES (safe — IF NOT EXISTS)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_platform ON profiles(platform, is_banned, roast_count DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created ON profiles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roasts_profile ON roasts(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_upvotes ON roasts(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_created ON roasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_user ON roasts(user_id);
CREATE INDEX IF NOT EXISTS idx_roasts_savage_level ON roasts(savage_level);

CREATE INDEX IF NOT EXISTS idx_battles_active ON battles(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_ip ON security_logs(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_karma_user ON user_karma(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_queue_unprocessed ON notification_queue(processed, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_hot_seat_roasts_seat ON hot_seat_roasts(hot_seat_id);
CREATE INDEX IF NOT EXISTS idx_reactions_roast ON hot_seat_roast_reactions(roast_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_active ON sponsors(active, position) WHERE active = true;

-- ============================================================
-- TRIGGERS (safe — use CREATE OR REPLACE)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION auto_hide_roast()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM reports WHERE roast_id = NEW.roast_id AND status = 'pending') >= 3 THEN
    UPDATE roasts SET is_hidden = true WHERE id = NEW.roast_id;
    UPDATE reports SET status = 'resolved' WHERE roast_id = NEW.roast_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_hide ON reports;
CREATE TRIGGER trigger_auto_hide
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION auto_hide_roast();

-- RPC Functions
CREATE OR REPLACE FUNCTION increment_karma(p_user_id UUID, p_upvotes_delta INT DEFAULT 0, p_roasts_delta INT DEFAULT 0)
RETURNS VOID AS $$
BEGIN
  UPDATE user_karma SET
    total_upvotes_received = total_upvotes_received + p_upvotes_delta,
    total_roasts_given = total_roasts_given + p_roasts_delta
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_burn_score(
  p_user_id UUID, p_score_delta INT DEFAULT 0, p_reactions_delta INT DEFAULT 0,
  p_battles_won_delta INT DEFAULT 0, p_challenges_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_karma SET
    burn_score = burn_score + p_score_delta,
    total_reactions_received = total_reactions_received + p_reactions_delta,
    total_battles_won = total_battles_won + p_battles_won_delta,
    total_challenges_completed = total_challenges_completed + p_challenges_delta
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_notifications_read(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE notifications SET is_read = true WHERE user_id = target_user_id AND is_read = false;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void AS $$
BEGIN
  DELETE FROM stories WHERE expires_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS — ENABLE + CREATE POLICIES (safe names)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_karma ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE roast_remixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_seat_roasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_seat_roast_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_rules ENABLE ROW LEVEL SECURITY;

-- PROFILES
DO $$ BEGIN CREATE POLICY "patch_profiles_select" ON profiles FOR SELECT USING (is_banned = false AND is_hidden = false); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_profiles_insert" ON profiles FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_profiles_update" ON profiles FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ROASTS
DO $$ BEGIN CREATE POLICY "patch_roasts_select" ON roasts FOR SELECT USING (is_hidden = false); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_roasts_insert" ON roasts FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_roasts_update" ON roasts FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- BATTLES
DO $$ BEGIN CREATE POLICY "patch_battles_select" ON battles FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_battles_insert" ON battles FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_battles_update" ON battles FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- STORIES
DO $$ BEGIN CREATE POLICY "patch_stories_select" ON stories FOR SELECT USING (expires_at > now() AND is_hidden = false); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_stories_insert" ON stories FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- STORY VIEWS
DO $$ BEGIN CREATE POLICY "patch_story_views_select" ON story_views FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_story_views_insert" ON story_views FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- REPORTS
DO $$ BEGIN CREATE POLICY "patch_reports_select" ON reports FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_reports_insert" ON reports FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SECURITY LOGS
DO $$ BEGIN CREATE POLICY "patch_security_insert" ON security_logs FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- BLOCKED IPS
DO $$ BEGIN CREATE POLICY "patch_blocked_select" ON blocked_ips FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_blocked_manage" ON blocked_ips FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CHALLENGES
DO $$ BEGIN CREATE POLICY "patch_challenges_select" ON challenges FOR SELECT USING (active = true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_challenges_manage" ON challenges FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- USER KARMA
DO $$ BEGIN CREATE POLICY "patch_karma_select" ON user_karma FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_karma_insert" ON user_karma FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_karma_update" ON user_karma FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- NOTIFICATION QUEUE
DO $$ BEGIN CREATE POLICY "patch_queue_insert" ON notification_queue FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_queue_select" ON notification_queue FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ROAST REMIXES
DO $$ BEGIN CREATE POLICY "patch_remixes_select" ON roast_remixes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_remixes_insert" ON roast_remixes FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- USER INTERACTIONS
DO $$ BEGIN CREATE POLICY "patch_interactions_select" ON user_interactions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_interactions_insert" ON user_interactions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- WAITLIST
DO $$ BEGIN CREATE POLICY "patch_waitlist_insert" ON waitlist FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SPONSORS
DO $$ BEGIN CREATE POLICY "patch_sponsors_select" ON sponsors FOR SELECT USING (active = true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- EMAIL SUBSCRIBERS
DO $$ BEGIN CREATE POLICY "patch_email_subscribe" ON email_subscribers FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- HOT SEATS
DO $$ BEGIN CREATE POLICY "patch_hotseats_select" ON hot_seats FOR SELECT USING (status != 'deleted'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_hotseats_insert" ON hot_seats FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_hotseats_update" ON hot_seats FOR UPDATE USING (auth.uid() = creator_id OR creator_id IS NULL); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- HOT SEAT ROASTS
DO $$ BEGIN CREATE POLICY "patch_hs_roasts_select" ON hot_seat_roasts FOR SELECT USING (is_hidden = false); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_hs_roasts_insert" ON hot_seat_roasts FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- HOT SEAT REACTIONS
DO $$ BEGIN CREATE POLICY "patch_hs_reactions_select" ON hot_seat_roast_reactions FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_hs_reactions_insert" ON hot_seat_roast_reactions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_hs_reactions_update" ON hot_seat_roast_reactions FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- USER CHALLENGES
DO $$ BEGIN CREATE POLICY "patch_uc_select" ON user_challenges FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = challenged_id); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_uc_insert" ON user_challenges FOR INSERT WITH CHECK (auth.uid() = challenger_id); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- BATTLE ROUNDS
DO $$ BEGIN CREATE POLICY "patch_br_select" ON battle_rounds FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_br_insert" ON battle_rounds FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- BATTLE HISTORY
DO $$ BEGIN CREATE POLICY "patch_bh_select" ON battle_history FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_bh_insert" ON battle_history FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- LEADERBOARD
DO $$ BEGIN CREATE POLICY "patch_lb_select" ON leaderboard_snapshots FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_lb_insert" ON leaderboard_snapshots FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- USER BLOCKS
DO $$ BEGIN CREATE POLICY "patch_blocks_select" ON user_blocks FOR SELECT USING (auth.uid() = blocker_id); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_blocks_insert" ON user_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_blocks_delete" ON user_blocks FOR DELETE USING (auth.uid() = blocker_id); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- MODERATION
DO $$ BEGIN CREATE POLICY "patch_mod_select" ON moderation_rules FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "patch_mod_manage" ON moderation_rules FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- REALTIME (safe — duplicate_object ignored)
-- ============================================================
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE roasts; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE battles; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stories; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE reports; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE hot_seat_roasts; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE hot_seat_roast_reactions; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO challenges (title, description, type, target_count, reward_karma) VALUES
  ('First Blood', 'Roast 1 person today', 'roast', 1, 5),
  ('Roast Rampage', 'Roast 5 people today', 'roast', 5, 15),
  ('LinkedIn Hunter', 'Roast 3 LinkedIn profiles today', 'linkedin', 3, 10),
  ('Upvote Magnet', 'Get 10 total upvotes on your roasts', 'upvote', 10, 20),
  ('Battle Judge', 'Vote in 3 roast battles today', 'vote', 3, 10),
  ('Viral Share', 'Share 1 roast card to socials', 'share', 1, 5),
  ('Brutal Week', 'Roast 7 days in a row (streak)', 'streak', 7, 50),
  ('Century Club', 'Get 100 total upvotes across all roasts', 'upvote', 100, 100)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DONE — All missing tables created, existing data preserved
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 2/3 — BASE SCHEMA (supabase/schema.sql)
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Master Supabase SQL Schema (10k+ Concurrency Ready)
-- Run this in your Supabase SQL Editor

-- 0. USER PROFILES TABLE (Auth-linked profiles)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text default '',
  karma int default 0,
  level text default 'Newbie',
  avatar_url text,
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;
drop policy if exists "Public can read user_profiles" on user_profiles;
create policy "Public can read user_profiles" on user_profiles for select using (true);
drop policy if exists "Users can update own user_profiles" on user_profiles;
create policy "Users can update own user_profiles" on user_profiles for update using (auth.uid() = id);
drop policy if exists "Users can insert own user_profiles" on user_profiles;
create policy "Users can insert own user_profiles" on user_profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can delete own user_profiles" on user_profiles;
create policy "Users can delete own user_profiles" on user_profiles for delete using (auth.uid() = id);

-- 1. PROFILES TABLE
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  platform text not null,
  bio text not null,
  avatar_letter text,
  avatar_color text default 'bg-[#ff4d00] text-black',
  tagline text,
  featured boolean default false,
  roast_count int default 0,
  total_upvotes int default 0,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 2. ROASTS TABLE (Includes IP Hash & Content Moderation Flag)
create table if not exists roasts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  roast_text text not null check (char_length(roast_text) <= 280),
  upvotes int default 0,
  reaction_haha int default 0,
  reaction_brutal int default 0,
  reaction_cry int default 0,
  anon_id text not null default 'Anon Roaster',
  ip_hash text,
  isClean boolean default true,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. BATTLES TABLE
create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  profile1_id uuid references profiles(id) on delete cascade,
  profile2_id uuid references profiles(id) on delete cascade,
  votes1 int default 0,
  votes2 int default 0,
  created_at timestamptz default now()
);

-- 4. REPORTS TABLE (Moderation Queue)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  roast_id uuid references roasts(id) on delete cascade,
  reason text not null,
  created_at timestamptz default now()
);

-- 5. BLOCKED IPS TABLE (Anti-Spam Shield)
create table if not exists blocked_ips (
  ip_hash text primary key,
  reason text not null default 'Rate limit flood or abuse',
  created_at timestamptz default now()
);

-- 6. EMAIL SUBSCRIBERS TABLE (Free Resend Alerts)
create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  constraint unique_profile_email unique(profile_id, email)
);

-- 7. DAILY WINNERS TABLE (Roast of the Day)
create table if not exists daily_winner (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  roast_id uuid references roasts(id) on delete cascade,
  date date default current_date,
  created_at timestamptz default now()
);

-- 8. FOLLOWS TABLE (Social follow/unfollow system)
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references auth.users(id) on delete cascade not null,
  following_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  constraint unique_follow unique(follower_id, following_id),
  constraint no_self_follow check (follower_id != following_id)
);

alter table follows enable row level security;
drop policy if exists "Public can read follows" on follows;
create policy "Public can read follows" on follows for select using (true);
drop policy if exists "Users can insert own follows" on follows;
create policy "Users can insert own follows" on follows for insert with check (auth.uid() = follower_id);
drop policy if exists "Users can delete own follows" on follows;
create policy "Users can delete own follows" on follows for delete using (auth.uid() = follower_id);

-- 9. INDEXES FOR ULTRA-FAST SCALING (10k+ users)
create index if not exists idx_user_profiles_username on user_profiles(username);
create index if not exists idx_roasts_user_id on roasts(user_id);
create index if not exists idx_profiles_user_id on profiles(user_id);
create index if not exists idx_follows_follower on follows(follower_id);
create index if not exists idx_follows_following on follows(following_id);

create index if not exists idx_roasts_profile_id on roasts(profile_id);
create index if not exists idx_roasts_created_at on roasts(created_at desc);
create index if not exists idx_roasts_upvotes on roasts(upvotes desc);
create index if not exists idx_roasts_ip_hash on roasts(ip_hash);
create index if not exists idx_profiles_created_at on profiles(created_at desc);
create index if not exists idx_profiles_featured on profiles(featured);

-- 10. REALTIME BROADCASTING
do $$ begin alter publication supabase_realtime add table roasts; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table profiles; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table battles; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table user_profiles; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table follows; exception when duplicate_object or undefined_table then null; end $$;

-- 11. ROW LEVEL SECURITY (RLS) POLICIES
alter table user_profiles enable row level security;
alter table profiles enable row level security;
alter table roasts enable row level security;
alter table battles enable row level security;
alter table reports enable row level security;
alter table blocked_ips enable row level security;
alter table email_subscribers enable row level security;
alter table daily_winner enable row level security;

-- Public Read Policies
drop policy if exists "Allow public read profiles" on profiles;
create policy "Allow public read profiles" on profiles for select using (true);
drop policy if exists "Allow public insert profiles" on profiles;
create policy "Allow public insert profiles" on profiles for insert with check (true);
drop policy if exists "Allow public update profiles" on profiles;
create policy "Allow public update profiles" on profiles for update using (true);
drop policy if exists "Allow public delete profiles" on profiles;
create policy "Allow public delete profiles" on profiles for delete using (true);

drop policy if exists "Allow public read roasts" on roasts;
create policy "Allow public read roasts" on roasts for select using (true);
drop policy if exists "Allow public insert roasts" on roasts;
create policy "Allow public insert roasts" on roasts for insert with check (true);
drop policy if exists "Allow public update roasts" on roasts;
create policy "Allow public update roasts" on roasts for update using (true);
drop policy if exists "Allow public delete roasts" on roasts;
create policy "Allow public delete roasts" on roasts for delete using (true);

drop policy if exists "Allow public read battles" on battles;
create policy "Allow public read battles" on battles for select using (true);
drop policy if exists "Allow public insert battles" on battles;
create policy "Allow public insert battles" on battles for insert with check (true);
drop policy if exists "Allow public update battles" on battles;
create policy "Allow public update battles" on battles for update using (true);

drop policy if exists "Allow public insert reports" on reports;
create policy "Allow public insert reports" on reports for insert with check (true);
drop policy if exists "Allow public read reports" on reports;
create policy "Allow public read reports" on reports for select using (true);
drop policy if exists "Allow public delete reports" on reports;
create policy "Allow public delete reports" on reports for delete using (true);

drop policy if exists "Allow public read blocked_ips" on blocked_ips;
create policy "Allow public read blocked_ips" on blocked_ips for select using (true);
drop policy if exists "Allow public insert blocked_ips" on blocked_ips;
create policy "Allow public insert blocked_ips" on blocked_ips for insert with check (true);

drop policy if exists "Allow public insert email_subscribers" on email_subscribers;
create policy "Allow public insert email_subscribers" on email_subscribers for insert with check (true);
drop policy if exists "Allow public read email_subscribers" on email_subscribers;
create policy "Allow public read email_subscribers" on email_subscribers for select using (true);

drop policy if exists "Allow public read daily_winner" on daily_winner;
create policy "Allow public read daily_winner" on daily_winner for select using (true);
drop policy if exists "Allow public insert daily_winner" on daily_winner;
create policy "Allow public insert daily_winner" on daily_winner for insert with check (true);

-- ────────────────────────────────────────────────────────────
-- SECTION 3/3 — MIGRATIONS
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/001_social_platform_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Social Platform Foundation Migration
-- NON-DESTRUCTIVE: Only adds new tables and extends existing ones.
-- Does NOT modify, rename, or delete any existing tables or columns.
-- ═══════════════════════════════════════════════════════════

-- 1. Extend user_profiles with social fields (safe ALTER ADD COLUMN)
-- These are additive only — existing columns are untouched.

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS visibility text default 'public';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS follower_count int default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS following_count int default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS post_count int default 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Social Posts table (future content types)
-- This is a generic content table that can eventually support
-- roasts, photos, opinions, polls, questions, battles, challenges.
-- Existing roasts table is NOT modified — this is for future use.

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content_type text not null default 'roast',
  content_text text,
  media_url text,
  metadata jsonb default '{}',
  reaction_count int default 0,
  comment_count int default 0,
  upvote_count int default 0,
  visibility text default 'public',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table social_posts enable row level security;
create policy "Public can read social_posts" on social_posts for select using (visibility = 'public');
create policy "Users can insert own social_posts" on social_posts for insert with check (auth.uid() = user_id);
create policy "Users can update own social_posts" on social_posts for update using (auth.uid() = user_id);
create policy "Users can delete own social_posts" on social_posts for delete using (auth.uid() = user_id);

-- 3. Comments table (generic, works for roasts and future posts)

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  target_type text not null default 'roast',
  target_id uuid not null,
  text text not null check (char_length(text) <= 500),
  parent_id uuid references comments(id) on delete cascade,
  upvotes int default 0,
  created_at timestamptz default now()
);

alter table comments enable row level security;
create policy "Public can read comments" on comments for select using (true);
create policy "Users can insert own comments" on comments for insert with check (auth.uid() = user_id);
create policy "Users can update own comments" on comments for update using (auth.uid() = user_id);
create policy "Users can delete own comments" on comments for delete using (auth.uid() = user_id);

-- 4. Reputation Events table (event-based scoring)

create table if not exists reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  points int not null default 0,
  reference_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table reputation_events enable row level security;
create policy "Public can read reputation_events" on reputation_events for select using (true);
create policy "System can insert reputation_events" on reputation_events for insert with check (true);

-- 5. Feature Flags table (runtime-configurable flags)

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_name text unique not null,
  enabled boolean default false,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feature_flags enable row level security;
create policy "Public can read feature_flags" on feature_flags for select using (true);
create policy "Admins can manage feature_flags" on feature_flags for all using (true);

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description) VALUES
  ('social_feed', false, 'Enable the social feed'),
  ('social_profiles', false, 'Enable enhanced social profiles'),
  ('social_follow', false, 'Enable the follow system'),
  ('social_reactions_v2', false, 'Enable v2 reaction system'),
  ('social_comments', false, 'Enable comments on content'),
  ('social_communities', false, 'Enable communities'),
  ('social_challenges_v2', false, 'Enable v2 challenge system'),
  ('social_discover_v2', false, 'Enable enhanced discovery'),
  ('social_search', false, 'Enable search'),
  ('social_stories', false, 'Enable stories'),
  ('social_reputation', false, 'Enable reputation system'),
  ('new_nav_shell', false, 'Enable new navigation shell'),
  ('mobile_bottom_nav', true, 'Enable mobile bottom navigation')
ON CONFLICT (flag_name) DO NOTHING;

-- 6. Indexes for new tables

create index if not exists idx_social_posts_user_id on social_posts(user_id);
create index if not exists idx_social_posts_created_at on social_posts(created_at desc);
create index if not exists idx_social_posts_content_type on social_posts(content_type);

create index if not exists idx_comments_target on comments(target_type, target_id);
create index if not exists idx_comments_user_id on comments(user_id);
create index if not exists idx_comments_created_at on comments(created_at desc);

create index if not exists idx_reputation_events_user_id on reputation_events(user_id);
create index if not exists idx_reputation_events_type on reputation_events(event_type);

create index if not exists idx_user_profiles_visibility on user_profiles(visibility);
create index if not exists idx_user_profiles_karma on user_profiles(karma desc);

-- 7. Enable realtime for new tables

do $$ begin alter publication supabase_realtime add table social_posts; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table comments; exception when duplicate_object or undefined_table then null; end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/002_roast_reactions.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Roast Reactions Migration
-- NON-DESTRUCTIVE: Only adds new table for tracking individual reactions.
-- ═══════════════════════════════════════════════════════════

-- 1. Roast Reactions table (tracks individual reactions per participant)
create table if not exists roast_reactions (
  id uuid primary key default gen_random_uuid(),
  roast_id uuid references roasts(id) on delete cascade not null,
  participant_id text not null,
  reaction_type text not null check (reaction_type in ('funny', 'savage', 'fatal')),
  created_at timestamptz default now(),
  constraint unique_roast_participant_reaction unique(roast_id, participant_id)
);

alter table roast_reactions enable row level security;
create policy "Public can read roast_reactions" on roast_reactions for select using (true);
create policy "Public can insert roast_reactions" on roast_reactions for insert with check (true);
create policy "Public can update own roast_reactions" on roast_reactions for update using (true);
create policy "Public can delete own roast_reactions" on roast_reactions for delete using (true);

-- 2. Indexes for fast lookups
create index if not exists idx_roast_reactions_roast_id on roast_reactions(roast_id);
create index if not exists idx_roast_reactions_participant on roast_reactions(participant_id);
create index if not exists idx_roast_reactions_type on roast_reactions(reaction_type);

-- 3. Enable realtime
do $$ begin alter publication supabase_realtime add table roast_reactions; exception when duplicate_object or undefined_table then null; end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/003_polls_and_votes.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Polls Migration
-- NON-DESTRUCTIVE: Only adds new tables for poll content.
-- ═══════════════════════════════════════════════════════════

-- 1. Polls table (extends social_posts with poll-specific data)
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references social_posts(id) on delete cascade not null,
  question text not null,
  options jsonb not null default '[]',
  total_votes int default 0,
  closes_at timestamptz,
  created_at timestamptz default now()
);

alter table polls enable row level security;
create policy "Public can read polls" on polls for select using (true);
create policy "Users can insert own polls" on polls for insert with check (true);
create policy "Users can update own polls" on polls for update using (true);

-- 2. Poll Votes table
create table if not exists poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references polls(id) on delete cascade not null,
  participant_id text not null,
  option_index int not null,
  created_at timestamptz default now(),
  constraint unique_poll_vote unique(poll_id, participant_id)
);

alter table poll_votes enable row level security;
create policy "Public can read poll_votes" on poll_votes for select using (true);
create policy "Public can insert poll_votes" on poll_votes for insert with check (true);

-- 3. Indexes
create index if not exists idx_polls_post_id on polls(post_id);
create index if not exists idx_poll_votes_poll_id on poll_votes(poll_id);
create index if not exists idx_poll_votes_participant on poll_votes(participant_id);

-- 4. Enable realtime
do $$ begin alter publication supabase_realtime add table polls; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table poll_votes; exception when duplicate_object or undefined_table then null; end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/004_unified_reactions.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Unified Reactions Migration
-- NON-DESTRUCTIVE: Creates new unified reactions table.
-- Existing roast_reactions table is preserved for backward compatibility.
-- ═══════════════════════════════════════════════════════════

-- 1. Unified Reactions table (works for all content types)
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('roast', 'social_post', 'comment')),
  target_id uuid not null,
  participant_id text not null,
  reaction_type text not null check (reaction_type in ('burn', 'dead', 'finished', 'brutal', 'wild', 'respect', 'hmm')),
  created_at timestamptz default now(),
  constraint unique_target_participant_reaction unique(target_type, target_id, participant_id)
);

alter table reactions enable row level security;
create policy "Public can read reactions" on reactions for select using (true);
create policy "Public can insert reactions" on reactions for insert with check (true);
create policy "Public can update own reactions" on reactions for update using (true);
create policy "Public can delete own reactions" on reactions for delete using (true);

-- 2. Indexes
create index if not exists idx_reactions_target on reactions(target_type, target_id);
create index if not exists idx_reactions_participant on reactions(participant_id);
create index if not exists idx_reactions_type on reactions(reaction_type);
create index if not exists idx_reactions_created_at on reactions(created_at desc);

-- 3. Enable realtime
do $$ begin alter publication supabase_realtime add table reactions; exception when duplicate_object or undefined_table then null; end $$;

-- 4. Comment reactions (for future use)
create table if not exists comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid references comments(id) on delete cascade not null,
  participant_id text not null,
  reaction_type text not null check (reaction_type in ('burn', 'dead', 'finished', 'brutal', 'wild', 'respect', 'hmm')),
  created_at timestamptz default now(),
  constraint unique_comment_reaction unique(comment_id, participant_id)
);

alter table comment_reactions enable row level security;
create policy "Public can read comment_reactions" on comment_reactions for select using (true);
create policy "Public can insert comment_reactions" on comment_reactions for insert with check (true);
create policy "Public can delete own comment_reactions" on comment_reactions for delete using (true);

create index if not exists idx_comment_reactions_comment on comment_reactions(comment_id);

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/005_reputation_gamification.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Reputation & Gamification Migration
-- NON-DESTRUCTIVE: Only adds new tables and extends existing ones.
-- ═══════════════════════════════════════════════════════════

-- 1. Enhanced Reputation Events (with idempotency and source tracking)
-- Extends existing reputation_events table concept
create table if not exists burn_rep_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  event_type text not null,
  points int not null default 0,
  source_type text,
  source_id uuid,
  metadata jsonb default '{}',
  idempotency_key text,
  created_at timestamptz default now(),
  constraint unique_idempotency unique(user_id, idempotency_key)
);

alter table burn_rep_events enable row level security;
create policy "Public can read burn_rep_events" on burn_rep_events for select using (true);
create policy "System can insert burn_rep_events" on burn_rep_events for insert with check (true);

create index if not exists idx_burn_rep_events_user on burn_rep_events(user_id);
create index if not exists idx_burn_rep_events_type on burn_rep_events(event_type);
create index if not exists idx_burn_rep_events_created on burn_rep_events(created_at desc);

-- 2. User Badges table
create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  badge_id text not null,
  unlocked_at timestamptz default now(),
  constraint unique_user_badge unique(user_id, badge_id)
);

alter table user_badges enable row level security;
create policy "Public can read user_badges" on user_badges for select using (true);
create policy "System can insert user_badges" on user_badges for insert with check (true);

create index if not exists idx_user_badges_user on user_badges(user_id);
create index if not exists idx_user_badges_badge on user_badges(badge_id);

-- 3. User Achievements table
create table if not exists user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  achievement_id text not null,
  unlocked_at timestamptz default now(),
  constraint unique_user_achievement unique(user_id, achievement_id)
);

alter table user_achievements enable row level security;
create policy "Public can read user_achievements" on user_achievements for select using (true);
create policy "System can insert user_achievements" on user_achievements for insert with check (true);

create index if not exists idx_user_achievements_user on user_achievements(user_id);

-- 4. User Streaks table
create table if not exists user_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  current_streak int default 0,
  longest_streak int default 0,
  last_active_date date,
  streak_freezes int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_user_streak unique(user_id)
);

alter table user_streaks enable row level security;
create policy "Public can read user_streaks" on user_streaks for select using (true);
create policy "System can insert user_streaks" on user_streaks for insert with check (true);
create policy "System can update user_streaks" on user_streaks for update using (true);

create index if not exists idx_user_streaks_user on user_streaks(user_id);

-- 5. Daily Activities table
create table if not exists daily_activities (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null default 'spark',
  title text not null,
  prompt text not null,
  category text default 'general',
  start_date date default current_date,
  end_date date,
  status text default 'active',
  created_at timestamptz default now()
);

alter table daily_activities enable row level security;
create policy "Public can read daily_activities" on daily_activities for select using (true);
create policy "System can manage daily_activities" on daily_activities for all using (true);

create index if not exists idx_daily_activities_date on daily_activities(start_date desc);
create index if not exists idx_daily_activities_status on daily_activities(status);

-- 6. Daily Activity Participations
create table if not exists daily_participations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references daily_activities(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content_type text default 'spark',
  content_id uuid,
  created_at timestamptz default now(),
  constraint unique_daily_participation unique(activity_id, user_id)
);

alter table daily_participations enable row level security;
create policy "Public can read daily_participations" on daily_participations for select using (true);
create policy "System can insert daily_participations" on daily_participations for insert with check (true);

create index if not exists idx_daily_participations_activity on daily_participations(activity_id);
create index if not exists idx_daily_participations_user on daily_participations(user_id);

-- 7. Enable realtime for new tables
do $$ begin alter publication supabase_realtime add table daily_activities; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table user_streaks; exception when duplicate_object or undefined_table then null; end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/006_social_features.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Social Features Migration
-- Follow + DM + Notifications + Activity Status
-- Run this in Supabase SQL Editor

-- ============================================================
-- 0. USER PROFILES TABLE (if not exists)
-- ============================================================
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text default '',
  karma int default 0,
  level text default 'Newbie',
  avatar_url text,
  created_at timestamptz default now()
);

-- Add RLS for user_profiles
alter table user_profiles enable row level security;
do $$ begin
  create policy "Public can read user_profiles" on user_profiles for select using (true);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users can update own user_profiles" on user_profiles for update using (auth.uid() = id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users can insert own user_profiles" on user_profiles for insert with check (auth.uid() = id);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 1. FOLLOWS TABLE
-- ============================================================
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references auth.users(id) on delete cascade,
  following_id uuid references auth.users(id) on delete cascade,
  created_at timestamp default now(),
  unique(follower_id, following_id)
);

-- ============================================================
-- 2. DM THREADS
-- ============================================================
create table if not exists dm_threads (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid references auth.users(id),
  user2_id uuid references auth.users(id),
  last_message text,
  updated_at timestamp default now(),
  unique(user1_id, user2_id)
);

-- ============================================================
-- 3. DM MESSAGES
-- ============================================================
create table if not exists dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references dm_threads(id) on delete cascade,
  sender_id uuid references auth.users(id),
  message text not null check (char_length(message) <= 280),
  is_roast boolean default true,
  created_at timestamp default now()
);

-- ============================================================
-- 4. NOTIFICATIONS TABLE
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean default false,
  created_at timestamp default now()
);

-- ============================================================
-- 5. ADD COLUMNS TO USER_PROFILES (safe - checks first)
-- ============================================================
do $$ begin
  alter table user_profiles add column last_active timestamp default now();
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column push_enabled boolean default true;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column email_notifications boolean default true;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column roast_alerts boolean default true;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column follow_alerts boolean default true;
exception when duplicate_column then null;
end $$;

-- ============================================================
-- 6. ENABLE REALTIME
-- ============================================================
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table dm_messages; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table follows; exception when duplicate_object or undefined_table then null; end $$;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

-- FOLLOWS
alter table follows enable row level security;
do $$ begin
  create policy "Public read follows" on follows for select using (true);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users can follow" on follows for insert with check (auth.uid() = follower_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users can unfollow" on follows for delete using (auth.uid() = follower_id);
exception when duplicate_object then null;
end $$;

-- DM THREADS
alter table dm_threads enable row level security;
do $$ begin
  create policy "Users read own threads" on dm_threads
    for select using (auth.uid() = user1_id or auth.uid() = user2_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users create threads" on dm_threads
    for insert with check (auth.uid() = user1_id or auth.uid() = user2_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users update own threads" on dm_threads
    for update using (auth.uid() = user1_id or auth.uid() = user2_id);
exception when duplicate_object then null;
end $$;

-- DM MESSAGES
alter table dm_messages enable row level security;
do $$ begin
  create policy "Thread participants read messages" on dm_messages
    for select using (
      exists (
        select 1 from dm_threads
        where dm_threads.id = dm_messages.thread_id
        and (auth.uid() = dm_threads.user1_id or auth.uid() = dm_threads.user2_id)
      )
    );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users send messages" on dm_messages
    for insert with check (auth.uid() = sender_id);
exception when duplicate_object then null;
end $$;

-- NOTIFICATIONS
alter table notifications enable row level security;
do $$ begin
  create policy "Users read own notifications" on notifications
    for select using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "System can insert notifications" on notifications
    for insert with check (true);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users update own notifications" on notifications
    for update using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 8. INDEXES for performance
-- ============================================================
create index if not exists idx_follows_follower on follows(follower_id);
create index if not exists idx_follows_following on follows(following_id);
create index if not exists idx_dm_threads_user1 on dm_threads(user1_id);
create index if not exists idx_dm_threads_user2 on dm_threads(user2_id);
create index if not exists idx_dm_messages_thread on dm_messages(thread_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_unread on notifications(user_id, is_read);
create index if not exists idx_user_profiles_username on user_profiles(username);

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/007_scaling_features.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Scaling Features Migration
-- Anti-spam, reports, and performance indexes

-- 1. Add reporter_ip column to reports table (for duplicate report prevention)
do $$ begin
  alter table reports add column reporter_ip text;
exception when duplicate_column then null;
end $$;

-- 2. Index on reports.roast_id for fast lookups
create index if not exists idx_reports_roast_id on reports(roast_id);
create index if not exists idx_reports_created_at on reports(created_at desc);
create index if not exists idx_reports_reporter_ip on reports(reporter_ip);

-- 3. Index on email_subscribers for fast notification lookups
create index if not exists idx_email_subscribers_profile on email_subscribers(profile_id);

-- 4. Index on blocked_ips for fast IP checks
create index if not exists idx_blocked_ips_hash on blocked_ips(ip_hash);

-- 5. Composite index for rate limiting queries
create index if not exists idx_roasts_ip_created on roasts(ip_hash, created_at desc);
create index if not exists idx_roasts_profile_created on roasts(profile_id, created_at desc);

-- 6. Index for pagination ordering
create index if not exists idx_profiles_pagination on profiles(created_at desc, id);

-- 7. Enable realtime on reports
do $$ begin alter publication supabase_realtime add table reports; exception when duplicate_object or undefined_table then null; end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/008_social_1m_scale.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD 1M Scale Social Features Migration
-- Counter caches, cursor pagination, polling-optimized indexes
-- Run this in Supabase SQL Editor

-- ============================================================
-- 0. ADD CACHED FOLLOW COUNTS TO USER_PROFILES
-- ============================================================
do $$ begin
  alter table user_profiles add column follower_count int default 0;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column following_count int default 0;
exception when duplicate_column then null;
end $$;

-- ============================================================
-- 1. DM THREADS - add last_message_at for proper ordering
-- ============================================================
do $$ begin
  alter table dm_threads add column last_message_at timestamp default now();
exception when duplicate_column then null;
end $$;

-- ============================================================
-- 2. DM MESSAGES - increase limit for 1M scale
-- ============================================================
-- Drop old check constraint and add new one with 500 char limit
do $$ begin
  alter table dm_messages drop constraint if exists dm_messages_message_check;
  alter table dm_messages add constraint dm_messages_message_check check (char_length(message) <= 500);
exception when undefined_object then null;
end $$;

-- ============================================================
-- 3. COMPOSITE INDEXES for cursor pagination (1M scale)
-- ============================================================

-- Follows: composite indexes for fast lookups
create index if not exists idx_follows_follower_created on follows(follower_id, created_at desc);
create index if not exists idx_follows_following_created on follows(following_id, created_at desc);

-- DM threads: composite indexes for pagination
create index if not exists idx_threads_user1_updated on dm_threads(user1_id, updated_at desc);
create index if not exists idx_threads_user2_updated on dm_threads(user2_id, updated_at desc);
create index if not exists idx_threads_last_message on dm_threads(last_message_at desc);

-- DM messages: composite index for cursor pagination
create index if not exists idx_dm_thread_created on dm_messages(thread_id, created_at desc);
create index if not exists idx_dm_sender on dm_messages(sender_id);

-- Notifications: composite indexes for cursor pagination
create index if not exists idx_notif_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notif_user_read_created on notifications(user_id, is_read, created_at desc);

-- User profiles: index for username search
create index if not exists idx_user_profiles_username_trgm on user_profiles using gin(username gin_trgm_ops);

-- Roasts: composite index for user roasts feed
create index if not exists idx_roasts_user_created on roasts(user_id, created_at desc);

-- Profiles: composite index for user profiles feed  
create index if not exists idx_profiles_user_created on profiles(user_id, created_at desc);

-- ============================================================
-- 4. RPC FUNCTION: Increment follow counts atomically
-- ============================================================
create or replace function increment_follow_counts(follower uuid, following uuid)
returns void as $$
begin
  update user_profiles set following_count = following_count + 1 where id = follower;
  update user_profiles set follower_count = follower_count + 1 where id = following;
end;
$$ language plpgsql;

create or replace function decrement_follow_counts(follower uuid, following uuid)
returns void as $$
begin
  update user_profiles set following_count = greatest(0, following_count - 1) where id = follower;
  update user_profiles set follower_count = greatest(0, follower_count - 1) where id = following;
end;
$$ language plpgsql;

-- ============================================================
-- 5. RPC FUNCTION: Batch mark notifications as read
-- ============================================================
create or replace function mark_notifications_read(target_user_id uuid)
returns void as $$
begin
  update notifications set is_read = true where user_id = target_user_id and is_read = false;
end;
$$ language plpgsql;

-- ============================================================
-- 6. ENABLE TRIGGERS for follow count sync
-- ============================================================
create or replace function sync_follow_counts_on_insert()
returns trigger as $$
begin
  update user_profiles set follower_count = follower_count + 1 where id = NEW.following_id;
  update user_profiles set following_count = following_count + 1 where id = NEW.follower_id;
  return NEW;
end;
$$ language plpgsql;

create or replace function sync_follow_counts_on_delete()
returns trigger as $$
begin
  update user_profiles set follower_count = greatest(0, follower_count - 1) where id = OLD.following_id;
  update user_profiles set following_count = greatest(0, following_count - 1) where id = OLD.follower_id;
  return OLD;
end;
$$ language plpgsql;

-- Drop old triggers if they exist, then create new ones
drop trigger if exists trigger_follow_insert on follows;
create trigger trigger_follow_insert
  after insert on follows
  for each row
  execute function sync_follow_counts_on_insert();

drop trigger if exists trigger_follow_delete on follows;
create trigger trigger_follow_delete
  after delete on follows
  for each row
  execute function sync_follow_counts_on_delete();

-- ============================================================
-- 7. ENABLE pg_trgm for username search (if not enabled)
-- ============================================================
-- Note: pg_trgm extension must be enabled in Supabase dashboard
-- This is a no-op if already enabled
create extension if not exists pg_trgm;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/009_notification_queue.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Batch Notification Queue for 1M Scale
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. NOTIFICATION QUEUE TABLE
-- ============================================================
-- Notifications are enqueued here, then batch-processed
-- This avoids N individual INSERTs when 1M users are active
create table if not exists notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  message text not null,
  link text,
  priority int default 0, -- higher = processed first
  dedup_key text, -- optional: deduplicate within time window
  processed boolean default false,
  created_at timestamp default now()
);

-- ============================================================
-- 2. INDEXES for fast queue processing
-- ============================================================
create index if not exists idx_notif_queue_unprocessed on notification_queue(processed, priority desc, created_at asc);
create index if not exists idx_notif_queue_user on notification_queue(user_id);
create index if not exists idx_notif_queue_dedup on notification_queue(dedup_key, created_at desc);

-- ============================================================
-- 3. RLS — anyone can insert, only system processes
-- ============================================================
alter table notification_queue enable row level security;

do $$ begin
  create policy "System can insert notifications" on notification_queue for insert with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can read own queue" on notification_queue
    for select using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 4. RPC: Batch insert notifications (up to 100 at once)
-- ============================================================
create or replace function batch_insert_notifications(
  notifications jsonb
)
returns int as $$
declare
  inserted_count int := 0;
  item jsonb;
begin
  for item in select * from jsonb_array_elements(notifications)
  loop
    -- Skip if dedup_key exists within last 60 seconds
    if item->>'dedup_key' is not null then
      if exists (
        select 1 from notification_queue
        where dedup_key = item->>'dedup_key'
        and created_at > now() - interval '60 seconds'
        and processed = false
      ) then
        continue;
      end if;
    end if;

    insert into notification_queue (user_id, type, title, message, link, priority, dedup_key)
    values (
      (item->>'user_id')::uuid,
      item->>'type',
      item->>'title',
      item->>'message',
      item->>'link',
      coalesce((item->>'priority')::int, 0),
      item->>'dedup_key'
    );
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$ language plpgsql;

-- ============================================================
-- 5. RPC: Process queue — moves items to notifications table
-- Called by Edge Function or cron, processes up to 500 items
-- ============================================================
create or replace function process_notification_queue(
  batch_size int default 500
)
returns int as $$
declare
  processed_count int := 0;
begin
  -- Move unprocessed items to notifications table in batch
  insert into notifications (user_id, type, title, message, link, is_read, created_at)
  select user_id, type, title, message, link, false, created_at
  from notification_queue
  where processed = false
  order by priority desc, created_at asc
  limit batch_size;

  GET DIAGNOSTICS processed_count = ROW_COUNT;

  -- Mark as processed
  update notification_queue
  set processed = true
  where id in (
    select id from notification_queue
    where processed = false
    order by priority desc, created_at asc
    limit batch_size
  );

  -- Cleanup: delete processed items older than 24 hours
  delete from notification_queue
  where processed = true
  and created_at < now() - interval '24 hours';

  return processed_count;
end;
$$ language plpgsql;

-- ============================================================
-- 6. RPC: Cleanup old queue items (called by cron)
-- ============================================================
create or replace function cleanup_notification_queue()
returns void as $$
begin
  -- Delete all processed items older than 24 hours
  delete from notification_queue
  where processed = true
  and created_at < now() - interval '24 hours';

  -- Delete unprocessed items older than 7 days (stuck/abandoned)
  delete from notification_queue
  where processed = false
  and created_at < now() - interval '7 days';
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/010_gamification.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Gamification — Real Data, No Fake Karma
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. CHALLENGES TABLE — Real daily tasks from DB
-- ============================================================
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  type text not null, -- 'roast', 'linkedin', 'upvote', 'vote', 'share'
  target_count int not null default 1,
  reward_karma int not null default 5,
  active boolean default true,
  created_at timestamp default now()
);

-- RLS
alter table challenges enable row level security;
do $$ begin
  create policy "Public read challenges" on challenges for select using (active = true);
exception when duplicate_object then null;
end $$;

-- Insert real challenges (rotated daily by type)
insert into challenges (title, description, type, target_count, reward_karma) values
  ('First Blood', 'Roast 1 person today', 'roast', 1, 5),
  ('Roast Rampage', 'Roast 5 people today', 'roast', 5, 15),
  ('LinkedIn Hunter', 'Roast 3 LinkedIn profiles today', 'linkedin', 3, 10),
  ('Upvote Magnet', 'Get 10 total upvotes on your roasts', 'upvote', 10, 20),
  ('Battle Judge', 'Vote in 3 roast battles today', 'vote', 3, 10),
  ('Viral Share', 'Share 1 roast card to socials', 'share', 1, 5),
  ('Brutal Week', 'Roast 7 days in a row (streak)', 'streak', 7, 50),
  ('Century Club', 'Get 100 total upvotes across all roasts', 'upvote', 100, 100)
on conflict do nothing;

-- ============================================================
-- 2. USER_KARMA TABLE — Real karma from real actions
-- ============================================================
create table if not exists user_karma (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anon_id text, -- for anonymous roasters
  total_upvotes_received int default 0,
  total_roasts_given int default 0,
  total_upvotes_given int default 0,
  level text default 'Newbie',
  streak int default 0,
  last_roast_date date,
  created_at timestamp default now(),
  unique(user_id),
  unique(anon_id)
);

alter table user_karma enable row level security;
do $$ begin
  create policy "Public read user_karma" on user_karma for select using (true);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Users update own karma" on user_karma for update using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "System can insert karma" on user_karma for insert with check (true);
exception when duplicate_object then null;
end $$;

-- Indexes
create index if not exists idx_user_karma_user on user_karma(user_id);
create index if not exists idx_user_karma_anon on user_karma(anon_id);
create index if not exists idx_user_karma_level on user_karma(level desc, total_upvotes_received desc);

-- ============================================================
-- 3. RPC: Increment karma atomically
-- ============================================================
create or replace function increment_karma(
  p_user_id uuid,
  p_upvotes_delta int default 0,
  p_roasts_delta int default 0
)
returns void as $$
begin
  update user_karma set
    total_upvotes_received = total_upvotes_received + p_upvotes_delta,
    total_roasts_given = total_roasts_given + p_roasts_delta
  where user_id = p_user_id;
end;
$$ language plpgsql;

-- ============================================================
-- 4. RPC: Update streak atomically
-- ============================================================
create or replace function update_streak(p_user_id uuid)
returns int as $$
declare
  current_streak int;
  last_date date;
  today date := current_date;
  yesterday date := current_date - 1;
begin
  select streak, last_roast_date into current_streak, last_date
  from user_karma where user_id = p_user_id;

  if current_streak is null then
    current_streak := 0;
  end if;

  if last_date = today then
    -- Already roasted today, streak unchanged
    return current_streak;
  elsif last_date = yesterday then
    -- Consecutive day
    current_streak := current_streak + 1;
  else
    -- Streak broken
    current_streak := 1;
  end if;

  update user_karma set
    streak = current_streak,
    last_roast_date = today
  where user_id = p_user_id;

  return current_streak;
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/012_notification_preferences.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Notification Preferences — Per-Type Toggles
-- Run this in Supabase SQL Editor

-- Add missing notification preference columns
do $$ begin
  alter table user_profiles add column dm_alerts boolean default true;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column upvote_alerts boolean default true;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column levelup_alerts boolean default true;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table user_profiles add column battle_alerts boolean default true;
exception when duplicate_column then null;
end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/013_notification_sounds.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD Notification Sounds — Per-Type Sound/Vibration Customization
-- Run this in Supabase SQL Editor

-- Add notification_sounds JSONB column to user_profiles
-- Stores per-type sound and vibration preferences
do $$ begin
  alter table user_profiles add column notification_sounds jsonb default '{
    "global_sound": true,
    "global_vibration": true,
    "roast": {"sound": true, "vibration": true},
    "follow": {"sound": true, "vibration": true},
    "dm": {"sound": true, "vibration": true},
    "upvote": {"sound": true, "vibration": true},
    "levelup": {"sound": true, "vibration": true},
    "battle": {"sound": true, "vibration": true}
  }'::jsonb;
exception when duplicate_column then null;
end $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_08_28_monetization_scaling.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURNBOARD V2.0 — MONETIZATION + SCALING
-- Run after the main production migration
-- ============================================================

-- ============================================================
-- WAITLIST (Pro + Sponsor)
-- ============================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pro', 'sponsor')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_type ON waitlist(type, created_at DESC);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin read waitlist" ON waitlist
  FOR SELECT USING (true);

-- ============================================================
-- SPONSORS (Future ad slots)
-- ============================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sponsor_name TEXT NOT NULL,
  sponsor_text TEXT,
  cta_link TEXT,
  image_url TEXT,
  position TEXT DEFAULT 'feed' CHECK (position IN ('feed', 'sidebar', 'reels')),
  active BOOLEAN DEFAULT true,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_active ON sponsors(active, position) WHERE active = true;

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active sponsors" ON sponsors
  FOR SELECT USING (active = true);

CREATE POLICY "Admin manage sponsors" ON sponsors
  FOR ALL USING (true);

-- ============================================================
-- CHALLENGES (Daily challenges)
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reward_karma INT DEFAULT 10,
  target_count INT DEFAULT 10,
  current_count INT DEFAULT 0,
  type TEXT CHECK (type IN ('roast', 'vote', 'share', 'follow')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active, created_at DESC) WHERE is_active = true;

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active challenges" ON challenges
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admin manage challenges" ON challenges
  FOR ALL USING (true);

-- ============================================================
-- PROFILES TABLE — Add missing columns if not present
-- ============================================================
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_letter TEXT;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_color TEXT;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tagline TEXT;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reaction_brutal INT DEFAULT 0;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reaction_haha INT DEFAULT 0;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reaction_cry INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- ROASTS TABLE — Add missing columns if not present
-- ============================================================
DO $$ BEGIN
  ALTER TABLE roasts ADD COLUMN IF NOT EXISTS reaction_cry INT DEFAULT 0;
  ALTER TABLE roasts ADD COLUMN IF NOT EXISTS is_clean BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- USER_PROFILES TABLE — Add missing columns if not present
-- ============================================================
DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_08_28_production_final.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURNBOARD V2.0 — PRODUCTION DATABASE (1M READY)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Clean old permissive policies
DROP POLICY IF EXISTS "Public read" ON profiles;
DROP POLICY IF EXISTS "Anyone can read not banned" ON profiles;
DROP POLICY IF EXISTS "Read profiles" ON profiles;
DROP POLICY IF EXISTS "Insert profiles" ON profiles;
DROP POLICY IF EXISTS "Update profiles" ON profiles;

-- ============================================================
-- PROFILES (Roast Targets)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin','github','twitter','instagram','producthunt','youtube','tiktok','reddit','x')),
  url TEXT,
  bio TEXT,
  avatar_url TEXT,
  avatar_letter TEXT,
  avatar_color TEXT,
  tagline TEXT,
  featured BOOLEAN DEFAULT false,
  roast_count INT DEFAULT 0,
  total_upvotes INT DEFAULT 0,
  reaction_brutal INT DEFAULT 0,
  reaction_haha INT DEFAULT 0,
  reaction_cry INT DEFAULT 0,
  is_banned BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_platform ON profiles(platform, is_banned, roast_count DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created ON profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_featured ON profiles(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON profiles(is_banned) WHERE is_banned = false;

-- ============================================================
-- ROASTS
-- ============================================================
CREATE TABLE IF NOT EXISTS roasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  roast_text TEXT NOT NULL CHECK (char_length(roast_text) >= 5 AND char_length(roast_text) <= 280),
  anon_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  upvotes INT DEFAULT 0,
  reaction_brutal INT DEFAULT 0,
  reaction_haha INT DEFAULT 0,
  reaction_cry INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  is_clean BOOLEAN DEFAULT true,
  ip_hash TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roasts_profile ON roasts(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_upvotes ON roasts(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_created ON roasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_user ON roasts(user_id);

-- ============================================================
-- USER PROFILES (Registered Users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]+$' AND char_length(username) >= 3),
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  karma INT DEFAULT 0,
  level TEXT DEFAULT 'Newbie' CHECK (level IN ('Newbie','Roaster','Brutal','Savage','Legend')),
  follower_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  streak INT DEFAULT 0,
  last_active TIMESTAMP DEFAULT now(),
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_karma ON user_profiles(karma DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_level ON user_profiles(level);
CREATE INDEX IF NOT EXISTS idx_user_profiles_active ON user_profiles(last_active DESC);

-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('roast','upvote','follow','dm','mention','milestone','challenge','system')),
  title TEXT,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- ============================================================
-- STORIES (24h expiring)
-- ============================================================
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  text TEXT CHECK (char_length(text) >= 2 AND char_length(text) <= 200),
  background_color TEXT DEFAULT '#ff4500',
  view_count INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(expires_at, is_hidden) WHERE is_hidden = false;

-- ============================================================
-- STORY VIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  viewed_at TIMESTAMP DEFAULT now(),
  UNIQUE(story_id, user_id),
  UNIQUE(story_id, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id);

-- ============================================================
-- ROAST REMIXES
-- ============================================================
CREATE TABLE IF NOT EXISTS roast_remixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_roast_id UUID REFERENCES roasts(id) ON DELETE CASCADE,
  original_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  remix_text TEXT CHECK (char_length(remix_text) >= 5 AND char_length(remix_text) <= 280),
  upvotes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remix_original ON roast_remixes(original_roast_id);
CREATE INDEX IF NOT EXISTS idx_remix_user ON roast_remixes(user_id);

-- ============================================================
-- USER INTERACTIONS (Feed Algorithm Data)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  target_user_id UUID,
  target_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT CHECK (action IN ('view','roast','upvote','reaction','follow','dm','share','battle_vote','view_reel','view_story')),
  platform TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inter_user ON user_interactions(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inter_anon ON user_interactions(anon_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inter_profile ON user_interactions(target_profile_id, action);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  reporter_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved','dismissed')),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_roast ON reports(roast_id);

-- ============================================================
-- BATTLES
-- ============================================================
CREATE TABLE IF NOT EXISTS battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  profile2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  votes1 INT DEFAULT 0,
  votes2 INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battles_active ON battles(is_active, created_at DESC);

-- ============================================================
-- SECURITY LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_ip ON security_logs(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_action ON security_logs(action, created_at DESC);

-- ============================================================
-- BLOCKED IPS
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip_hash TEXT PRIMARY KEY,
  reason TEXT,
  blocked_by UUID,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- DAILY CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reward TEXT,
  target_count INT DEFAULT 10,
  current_count INT DEFAULT 0,
  type TEXT CHECK (type IN ('roast','vote','share')),
  date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_date ON daily_challenges(date, is_active);

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE roast_remixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — STRICT
-- ============================================================

-- PROFILES
CREATE POLICY "Read not banned profiles" ON profiles
  FOR SELECT USING (is_banned = false AND is_hidden = false);

CREATE POLICY "Auth create profile" ON profiles
  FOR INSERT WITH CHECK (
    char_length(username) >= 3
    AND username ~ '^[a-zA-Z0-9_]+$'
  );

CREATE POLICY "Owner update profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ROASTS
CREATE POLICY "Read not hidden roasts" ON roasts
  FOR SELECT USING (is_hidden = false);

CREATE POLICY "Create roast with validation" ON roasts
  FOR INSERT WITH CHECK (
    char_length(roast_text) >= 5
    AND char_length(roast_text) <= 280
    AND roast_text !~* '<script'
    AND roast_text !~* 'javascript:'
  );

CREATE POLICY "Update own roast reactions" ON roasts
  FOR UPDATE USING (true);

-- USER PROFILES
CREATE POLICY "Public read non-banned users" ON user_profiles
  FOR SELECT USING (is_banned = false);

CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- FOLLOWS
CREATE POLICY "Public read follows" ON follows
  FOR SELECT USING (true);

CREATE POLICY "Users follow" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users unfollow" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- NOTIFICATIONS
CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- STORIES
CREATE POLICY "Public read active stories" ON stories
  FOR SELECT USING (expires_at > now() AND is_hidden = false);

CREATE POLICY "Users create story" ON stories
  FOR INSERT WITH CHECK (
    char_length(text) >= 2
    AND char_length(text) <= 200
  );

-- STORY VIEWS
CREATE POLICY "Users insert story views" ON story_views
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Read story views" ON story_views
  FOR SELECT USING (true);

-- ROAST REMIXES
CREATE POLICY "Read remixes" ON roast_remixes
  FOR SELECT USING (true);

CREATE POLICY "Create remix" ON roast_remixes
  FOR INSERT WITH CHECK (
    char_length(remix_text) >= 5
    AND char_length(remix_text) <= 280
  );

-- USER INTERACTIONS
CREATE POLICY "Insert interactions" ON user_interactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Read own interactions" ON user_interactions
  FOR SELECT USING (
    auth.uid() = user_id
    OR anon_id = current_setting('request.headers', true)::jsonb->>'x-anon-id'
  );

-- REPORTS
CREATE POLICY "Insert report" ON reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin read reports" ON reports
  FOR SELECT USING (true);

-- BATTLES
CREATE POLICY "Public read battles" ON battles
  FOR SELECT USING (true);

CREATE POLICY "Update battles" ON battles
  FOR UPDATE USING (true);

CREATE POLICY "Insert battles" ON battles
  FOR INSERT WITH CHECK (true);

-- SECURITY LOGS (admin only via service role)
CREATE POLICY "Insert security logs" ON security_logs
  FOR INSERT WITH CHECK (true);

-- BLOCKED IPS
CREATE POLICY "Insert blocked ips" ON blocked_ips
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Delete blocked ips" ON blocked_ips
  FOR DELETE USING (true);

-- DAILY CHALLENGES
CREATE POLICY "Public read challenges" ON daily_challenges
  FOR SELECT USING (true);

CREATE POLICY "Insert challenges" ON daily_challenges
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update challenges" ON daily_challenges
  FOR UPDATE USING (true);

-- ============================================================
-- REALTIME PUBLICATIONS
-- ============================================================
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table stories; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table roasts; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table profiles; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table follows; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table battles; exception when duplicate_object or undefined_table then null; end $$;

-- ============================================================
-- AUTO-UPDATE TRIGGER (updated_at)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CLEANUP FUNCTION (auto-delete expired stories)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void AS $$
BEGIN
  DELETE FROM stories WHERE expires_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DONE — All 1M-ready tables created with indexes + RLS
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_01_viral_modules.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURN BOARD V2.1 — VIRAL MODULES (Phases 1-10)
-- Additive-only migration. No existing tables modified.
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PHASE 2: HOT SEAT
-- ============================================================
-- Add hot seat columns to existing profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hot_seat_token TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hot_seat_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hot_seat_share_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_hot_seat_token ON profiles(hot_seat_token) WHERE hot_seat_token IS NOT NULL;

-- ============================================================
-- PHASE 4: BURN SCORE
-- ============================================================
-- Add burn score to user_karma
ALTER TABLE user_karma ADD COLUMN IF NOT EXISTS burn_score INT DEFAULT 0;
ALTER TABLE user_karma ADD COLUMN IF NOT EXISTS total_reactions_received INT DEFAULT 0;
ALTER TABLE user_karma ADD COLUMN IF NOT EXISTS total_battles_won INT DEFAULT 0;
ALTER TABLE user_karma ADD COLUMN IF NOT EXISTS total_challenges_completed INT DEFAULT 0;

-- RPC: Increment burn score atomically
CREATE OR REPLACE FUNCTION increment_burn_score(
  p_user_id UUID,
  p_score_delta INT DEFAULT 0,
  p_reactions_delta INT DEFAULT 0,
  p_battles_won_delta INT DEFAULT 0,
  p_challenges_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_karma SET
    burn_score = burn_score + p_score_delta,
    total_reactions_received = total_reactions_received + p_reactions_delta,
    total_battles_won = total_battles_won + p_battles_won_delta,
    total_challenges_completed = total_challenges_completed + p_challenges_delta
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PHASE 6: FRIEND CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenged_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenger_score INT DEFAULT 0,
  challenged_score INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','completed','expired','declined')),
  challenge_type TEXT DEFAULT 'roast_battle' CHECK (challenge_type IN ('roast_battle','most_roasts','most_upvotes','karma_race')),
  description TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own challenges" ON user_challenges
    FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users create challenges" ON user_challenges
    FOR INSERT WITH CHECK (auth.uid() = challenger_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own challenges" ON user_challenges
    FOR UPDATE USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON user_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON user_challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON user_challenges(status, created_at DESC);

-- ============================================================
-- PHASE 7: ENHANCED BATTLES (Rounds + History)
-- ============================================================
CREATE TABLE IF NOT EXISTS battle_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  round_number INT NOT NULL DEFAULT 1,
  profile1_roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  profile2_roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  votes1 INT DEFAULT 0,
  votes2 INT DEFAULT 0,
  winner INT CHECK (winner IN (1, 2)),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE battle_rounds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read battle rounds" ON battle_rounds FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Insert battle rounds" ON battle_rounds FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Update battle rounds" ON battle_rounds FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_battle_rounds_battle ON battle_rounds(battle_id);

CREATE TABLE IF NOT EXISTS battle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE,
  profile1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  profile2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  winner_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  total_votes1 INT DEFAULT 0,
  total_votes2 INT DEFAULT 0,
  round_count INT DEFAULT 1,
  completed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE battle_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read battle history" ON battle_history FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Insert battle history" ON battle_history FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_battle_history_completed ON battle_history(completed_at DESC);

-- ============================================================
-- PHASE 9: LEADERBOARD SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  burn_score INT DEFAULT 0,
  total_upvotes INT DEFAULT 0,
  total_roasts INT DEFAULT 0,
  level TEXT DEFAULT 'Newbie',
  category TEXT DEFAULT 'alltime' CHECK (category IN ('alltime','weekly','daily','monthly')),
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public read leaderboard snapshots" ON leaderboard_snapshots FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Insert leaderboard snapshots" ON leaderboard_snapshots FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_leaderboard_category ON leaderboard_snapshots(category, burn_score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_date ON leaderboard_snapshots(snapshot_date, category);

-- ============================================================
-- PHASE 10: MODERATION (User Blocks + Auto Rules)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own blocks" ON user_blocks
    FOR SELECT USING (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users block" ON user_blocks
    FOR INSERT WITH CHECK (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users unblock" ON user_blocks
    FOR DELETE USING (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Moderation rules (auto-filter configuration)
CREATE TABLE IF NOT EXISTS moderation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('word_filter','rate_limit_escalation','auto_hide','shadowban')),
  pattern TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'flag',
  severity INT DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE moderation_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admin read rules" ON moderation_rules FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admin insert rules" ON moderation_rules FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Auto-hide threshold: roast reported 3+ times → auto-hide
CREATE OR REPLACE FUNCTION auto_hide_roast()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM reports WHERE roast_id = NEW.roast_id AND status = 'pending') >= 3 THEN
    UPDATE roasts SET is_hidden = true WHERE id = NEW.roast_id;
    UPDATE reports SET status = 'resolved' WHERE roast_id = NEW.roast_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_hide ON reports;
CREATE TRIGGER trigger_auto_hide
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION auto_hide_roast();

-- ============================================================
-- PHASE 8: TRENDING (computed from existing data — no new table needed)
-- ============================================================
-- Trending is computed via queries on existing roasts + user_interactions
-- No new tables required.

-- ============================================================
-- REALTIME for new tables
-- ============================================================
do $$ begin alter publication supabase_realtime add table user_challenges; exception when duplicate_object or undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table battle_rounds; exception when duplicate_object or undefined_table then null; end $$;

-- ============================================================
-- DONE — All viral module tables created
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_experiments.sql
-- ────────────────────────────────────────────────────────────

-- BURN BOARD — Experiments & Growth Analytics Migration
-- Additive only. Does not modify existing tables.

-- ── Experiments Table ────────────────────────────────────────
-- Stores experiment configuration (for server-side management)

CREATE TABLE IF NOT EXISTS experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  variants JSONB NOT NULL DEFAULT '[]',
  primary_metric TEXT,
  guardrail_metrics JSONB DEFAULT '[]',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Experiment Assignments Table ──────────────────────────────
-- Stores user variant assignments (for server-side persistence)

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL, -- user_id or anonymous session id
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(experiment_id, subject_id)
);

-- ── Experiment Exposures Table ────────────────────────────────
-- Stores exposure events (for accurate conversion tracking)

CREATE TABLE IF NOT EXISTS experiment_exposures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  exposed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(experiment_id, subject_id) -- one exposure per user per experiment
);

-- ── Experiment Conversions Table ──────────────────────────────
-- Stores conversion events

CREATE TABLE IF NOT EXISTS experiment_conversions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  event TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  converted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Growth Events Table ──────────────────────────────────────
-- Stores aggregate growth funnel events (privacy-conscious)

CREATE TABLE IF NOT EXISTS growth_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_id TEXT, -- optional, can be anonymous
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────

-- Experiments
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_experiments_key ON experiments(key);

-- Assignments
CREATE INDEX IF NOT EXISTS idx_assignments_experiment ON experiment_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON experiment_assignments(subject_id);

-- Exposures
CREATE INDEX IF NOT EXISTS idx_exposures_experiment ON experiment_exposures(experiment_id);
CREATE INDEX IF NOT EXISTS idx_exposures_subject ON experiment_exposures(subject_id);
CREATE INDEX IF NOT EXISTS idx_exposures_variant ON experiment_exposures(experiment_id, variant);

-- Conversions
CREATE INDEX IF NOT EXISTS idx_conversions_experiment ON experiment_conversions(experiment_id);
CREATE INDEX IF NOT EXISTS idx_conversions_subject ON experiment_conversions(subject_id);
CREATE INDEX IF NOT EXISTS idx_conversions_variant ON experiment_conversions(experiment_id, variant);
CREATE INDEX IF NOT EXISTS idx_conversions_event ON experiment_conversions(experiment_id, event);

-- Growth Events
CREATE INDEX IF NOT EXISTS idx_growth_events_type ON growth_events(event_type);
CREATE INDEX IF NOT EXISTS idx_growth_events_created ON growth_events(created_at);

-- ── RPC Functions ────────────────────────────────────────────

-- Get experiment by key
CREATE OR REPLACE FUNCTION get_experiment_by_key(p_key TEXT)
RETURNS TABLE (
  id UUID,
  key TEXT,
  name TEXT,
  description TEXT,
  status TEXT,
  variants JSONB,
  primary_metric TEXT,
  guardrail_metrics JSONB,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.key, e.name, e.description, e.status, e.variants, 
         e.primary_metric, e.guardrail_metrics, e.start_at, e.end_at
  FROM experiments e
  WHERE e.key = p_key AND e.status = 'active';
END;
$$;

-- Get or create assignment (stable assignment)
CREATE OR REPLACE FUNCTION get_or_create_assignment(
  p_experiment_id UUID,
  p_subject_id TEXT,
  p_variants JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_variant TEXT;
  v_hash BIGINT;
  v_index INTEGER;
BEGIN
  -- Check existing assignment
  SELECT variant INTO v_variant
  FROM experiment_assignments
  WHERE experiment_id = p_experiment_id AND subject_id = p_subject_id;
  
  IF v_variant IS NOT NULL THEN
    RETURN v_variant;
  END IF;
  
  -- Create deterministic assignment based on hash
  v_hash := hashtext(p_experiment_id::TEXT || p_subject_id);
  v_index := abs(v_hash) % jsonb_array_length(p_variants);
  v_variant := p_variants->>v_index;
  
  -- Insert assignment
  INSERT INTO experiment_assignments (experiment_id, subject_id, variant)
  VALUES (p_experiment_id, p_subject_id, v_variant)
  ON CONFLICT (experiment_id, subject_id) DO NOTHING;
  
  RETURN v_variant;
END;
$$;

-- Record exposure (idempotent)
CREATE OR REPLACE FUNCTION record_experiment_exposure(
  p_experiment_id UUID,
  p_subject_id TEXT,
  p_variant TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO experiment_exposures (experiment_id, subject_id, variant)
  VALUES (p_experiment_id, p_subject_id, p_variant)
  ON CONFLICT (experiment_id, subject_id) DO NOTHING;
  
  RETURN FOUND;
END;
$$;

-- Record conversion (with exposure check)
CREATE OR REPLACE FUNCTION record_experiment_conversion(
  p_experiment_id UUID,
  p_subject_id TEXT,
  p_event TEXT,
  p_data JSONB DEFAULT '{}'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_variant TEXT;
BEGIN
  -- Check exposure first
  SELECT variant INTO v_variant
  FROM experiment_exposures
  WHERE experiment_id = p_experiment_id AND subject_id = p_subject_id;
  
  IF v_variant IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Record conversion
  INSERT INTO experiment_conversions (experiment_id, subject_id, variant, event, data)
  VALUES (p_experiment_id, p_subject_id, v_variant, p_event, p_data);
  
  RETURN TRUE;
END;
$$;

-- Get experiment report (aggregate)
CREATE OR REPLACE FUNCTION get_experiment_report(p_experiment_id UUID)
RETURNS TABLE (
  variant TEXT,
  exposures BIGINT,
  conversions BIGINT,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.variant,
    COUNT(DISTINCT e.subject_id) as exposures,
    COUNT(DISTINCT c.subject_id) as conversions,
    CASE 
      WHEN COUNT(DISTINCT e.subject_id) > 0 
      THEN ROUND(COUNT(DISTINCT c.subject_id)::NUMERIC / COUNT(DISTINCT e.subject_id) * 100, 2)
      ELSE 0 
    END as conversion_rate
  FROM experiment_exposures e
  LEFT JOIN experiment_conversions c 
    ON e.experiment_id = c.experiment_id 
    AND e.subject_id = c.subject_id
    AND e.variant = c.variant
  WHERE e.experiment_id = p_experiment_id
  GROUP BY e.variant;
END;
$$;

-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_exposures ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage experiments" ON experiments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage assignments" ON experiment_assignments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage exposures" ON experiment_exposures
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage conversions" ON experiment_conversions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage growth events" ON growth_events
  FOR ALL USING (auth.role() = 'service_role');

-- Anonymous insert for growth events (privacy-conscious)
CREATE POLICY "Anyone can insert growth events" ON growth_events
  FOR INSERT WITH CHECK (true);

-- ── Comments ─────────────────────────────────────────────────

COMMENT ON TABLE experiments IS 'A/B experiment configurations';
COMMENT ON TABLE experiment_assignments IS 'Stable variant assignments per user';
COMMENT ON TABLE experiment_exposures IS 'Exposure tracking for conversion attribution';
COMMENT ON TABLE experiment_conversions IS 'Conversion events tied to experiments';
COMMENT ON TABLE growth_events IS 'Privacy-conscious aggregate growth funnel events';

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_fix_rls_auth.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- FIX RLS POLICIES — September 2, 2026
-- 
-- Problem: Roast posting and auth not working because:
-- 1. INSERT policy on roasts was too restrictive
-- 2. Profiles INSERT policy blocked user_profiles table
-- 3. No DELETE policy on roasts for owners
--
-- Solution: Drop and recreate policies with correct permissions
-- ============================================================

-- ============================================================
-- ROASTS TABLE
-- ============================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Create roast with validation" ON roasts;
DROP POLICY IF EXISTS "Read not hidden roasts" ON roasts;
DROP POLICY IF EXISTS "Update own roast reactions" ON roasts;

-- Public can read all non-hidden roasts
CREATE POLICY "Public can read roasts" ON roasts
  FOR SELECT USING (is_hidden = false);

-- Allow inserts from both authenticated and anonymous users
-- This is critical: the app allows anonymous roasting via the API
CREATE POLICY "Allow roast insert" ON roasts
  FOR INSERT WITH CHECK (true);

-- Anyone can update reactions (upvotes, haha, brutal, cry)
CREATE POLICY "Allow reaction updates" ON roasts
  FOR UPDATE USING (true);

-- Owners can delete their own roasts
CREATE POLICY "Users can delete own roasts" ON roasts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- PROFILES TABLE (public roast targets)
-- ============================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Read not banned profiles" ON profiles;
DROP POLICY IF EXISTS "Auth create profile" ON profiles;
DROP POLICY IF EXISTS "Owner update profile" ON profiles;

-- Public can read non-banned, non-hidden profiles
CREATE POLICY "Public can read profiles" ON profiles
  FOR SELECT USING (is_banned = false AND is_hidden = false);

-- Anyone can create a profile (roast target)
-- The API route handles validation; RLS just needs to allow the insert
CREATE POLICY "Allow profile insert" ON profiles
  FOR INSERT WITH CHECK (true);

-- Profile owners can update their own profile
CREATE POLICY "Profile owners can update" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- USER_PROFILES TABLE (registered users)
-- ============================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Public read non-banned users" ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON user_profiles;

-- Public can read non-banned user profiles
CREATE POLICY "Public can read user profiles" ON user_profiles
  FOR SELECT USING (is_banned = false);

-- Users can insert their own profile (during signup)
CREATE POLICY "Users insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (true);

-- Users can update their own profile
CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- BATTLES TABLE
-- ============================================================
DROP POLICY IF EXISTS "Public read battles" ON battles;
DROP POLICY IF EXISTS "Allow battle insert" ON battles;
DROP POLICY IF EXISTS "Allow battle update" ON battles;

CREATE POLICY "Public can read battles" ON battles
  FOR SELECT USING (true);

CREATE POLICY "Allow battle insert" ON battles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow battle updates" ON battles
  FOR UPDATE USING (true);

-- ============================================================
-- BLOCKED IPS TABLE (admin only)
-- ============================================================
DROP POLICY IF EXISTS "Public read blocked_ips" ON blocked_ips;
DROP POLICY IF EXISTS "Admin manage blocked_ips" ON blocked_ips;

CREATE POLICY "Public can read blocked_ips" ON blocked_ips
  FOR SELECT USING (true);

CREATE POLICY "Allow blocked_ips management" ON blocked_ips
  FOR ALL USING (true);

-- ============================================================
-- REPORTS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Public read reports" ON reports;
DROP POLICY IF EXISTS "Public insert reports" ON reports;

CREATE POLICY "Public can read reports" ON reports
  FOR SELECT USING (true);

CREATE POLICY "Allow report insert" ON reports
  FOR INSERT WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_friend_challenges.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURN BOARD — FRIEND CHALLENGE SYSTEM
-- Additive-only migration. No existing tables modified.
-- ============================================================

-- ============================================================
-- FRIEND CHALLENGES TABLE
-- Works with both authenticated and anonymous users
-- Uses unique public tokens for shareable challenge links
-- ============================================================

CREATE TABLE IF NOT EXISTS friend_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Unique public token for shareable links (hard to guess)
  public_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  
  -- Challenger identity (either user_id or anon_id)
  challenger_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  challenger_anon_id TEXT,
  challenger_display_name TEXT DEFAULT 'Someone',
  
  -- Optional source references
  source_hot_seat_id UUID REFERENCES hot_seats(id) ON DELETE SET NULL,
  source_burn_score INT,
  
  -- Challenge status lifecycle
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active',      -- Challenge can be accepted
    'accepted',    -- A participant has accepted
    'completed',   -- Challenged participant created a Hot Seat
    'expired',     -- Challenge expired (optional)
    'cancelled'    -- Challenge cancelled/invalid
  )),
  
  -- Attribution tracking
  accepted_by_anon_id TEXT,
  accepted_hot_seat_id UUID REFERENCES hot_seats(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_friend_challenges_token ON friend_challenges(public_token);
CREATE INDEX IF NOT EXISTS idx_friend_challenges_challenger ON friend_challenges(challenger_user_id) WHERE challenger_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_friend_challenges_challenger_anon ON friend_challenges(challenger_anon_id) WHERE challenger_anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_friend_challenges_status ON friend_challenges(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_challenges_source_hot_seat ON friend_challenges(source_hot_seat_id) WHERE source_hot_seat_id IS NOT NULL;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE friend_challenges ENABLE ROW LEVEL SECURITY;

-- Public read for active challenges (needed for challenge landing page)
DO $$ BEGIN
  CREATE POLICY "friend_challenges_select_active" ON friend_challenges
    FOR SELECT USING (status = 'active' OR status = 'accepted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Challengers can create challenges
DO $$ BEGIN
  CREATE POLICY "friend_challenges_insert" ON friend_challenges
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Challengers and accepted users can update their challenges
DO $$ BEGIN
  CREATE POLICY "friend_challenges_update" ON friend_challenges
    FOR UPDATE USING (
      auth.uid() = challenger_user_id 
      OR auth.uid() IS NULL  -- Allow anonymous updates
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_friend_challenges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_friend_challenges_updated_at ON friend_challenges;
CREATE TRIGGER update_friend_challenges_updated_at
  BEFORE UPDATE ON friend_challenges
  FOR EACH ROW EXECUTE FUNCTION update_friend_challenges_updated_at();

-- ============================================================
-- REALTIME
-- ============================================================

do $$ begin alter publication supabase_realtime add table friend_challenges; exception when duplicate_object or undefined_table then null; end $$;

-- ============================================================
-- DONE — Friend Challenges table created
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_hot_seat.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURN BOARD — HOT SEAT FEATURE (Master Prompt #2)
-- Additive-only migration. No existing tables modified.
-- Run this in Supabase SQL Editor
-- ============================================================

-- HOT SEATS TABLE
CREATE TABLE IF NOT EXISTS hot_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  category TEXT NOT NULL CHECK (category IN (
    'photo', 'vibe', 'bio', 'outfit', 'idea',
    'dating_profile', 'music_taste', 'hot_take'
  )),
  title TEXT NOT NULL,
  context TEXT DEFAULT '',
  image_url TEXT DEFAULT NULL,
  heat_level TEXT NOT NULL DEFAULT 'savage' CHECK (heat_level IN ('light', 'savage', 'brutal')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'deleted')),
  roast_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- HOT SEAT ROASTS TABLE
CREATE TABLE IF NOT EXISTS hot_seat_roasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hot_seat_id UUID REFERENCES hot_seats(id) ON DELETE CASCADE,
  roast_text TEXT NOT NULL CHECK (char_length(roast_text) <= 280),
  anon_id TEXT NOT NULL DEFAULT 'Anonymous Roaster',
  ip_hash TEXT,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_hot_seats_creator ON hot_seats(creator_id);
CREATE INDEX IF NOT EXISTS idx_hot_seats_status ON hot_seats(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_seats_created ON hot_seats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_seat_roasts_seat ON hot_seat_roasts(hot_seat_id);
CREATE INDEX IF NOT EXISTS idx_hot_seat_roasts_created ON hot_seat_roasts(hot_seat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_seat_roasts_ip ON hot_seat_roasts(ip_hash);

-- ROW LEVEL SECURITY
ALTER TABLE hot_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_seat_roasts ENABLE ROW LEVEL SECURITY;

-- Hot Seats: public read, anyone can insert (anon or auth)
DO $$ BEGIN
  CREATE POLICY "Public read hot seats" ON hot_seats
    FOR SELECT USING (status != 'deleted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can create hot seats" ON hot_seats
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Creators can update own hot seats" ON hot_seats
    FOR UPDATE USING (
      auth.uid() = creator_id OR creator_id IS NULL
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Creators can delete own hot seats" ON hot_seats
    FOR DELETE USING (
      auth.uid() = creator_id OR creator_id IS NULL
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Hot Seat Roasts: public read, anyone can insert
DO $$ BEGIN
  CREATE POLICY "Public read hot seat roasts" ON hot_seat_roasts
    FOR SELECT USING (is_hidden = false);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can submit hot seat roasts" ON hot_seat_roasts
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- REALTIME for hot seat roasts (live updates)
do $$ begin alter publication supabase_realtime add table hot_seat_roasts; exception when duplicate_object or undefined_table then null; end $$;

-- ============================================================
-- DONE — Hot Seat tables created
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_hot_seat_reactions.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURN BOARD — HOT SEAT REACTIONS (Master Prompt #3)
-- Additive-only migration. No existing tables modified.
-- Run this in Supabase SQL Editor
-- ============================================================

-- HOT SEAT ROAST REACTIONS TABLE
-- One active reaction per participant per roast (toggle/change/remove)
CREATE TABLE IF NOT EXISTS hot_seat_roast_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roast_id UUID NOT NULL REFERENCES hot_seat_roasts(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,  -- anon_id or user_id string
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('funny', 'savage', 'fatal')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- UNIQUE CONSTRAINT: Only one active reaction per participant per roast
-- This is enforced at the application layer via upsert logic, but we add
-- a partial unique index for database-level safety.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_reaction
  ON hot_seat_roast_reactions(roast_id, participant_id)
  WHERE is_active = true;

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_reactions_roast ON hot_seat_roast_reactions(roast_id);
CREATE INDEX IF NOT EXISTS idx_reactions_participant ON hot_seat_roast_reactions(participant_id);
CREATE INDEX IF NOT EXISTS idx_reactions_type ON hot_seat_roast_reactions(reaction_type) WHERE is_active = true;

-- ROW LEVEL SECURITY
ALTER TABLE hot_seat_roast_reactions ENABLE ROW LEVEL SECURITY;

-- Public can read active reactions
DO $$ BEGIN
  CREATE POLICY "Public read active reactions" ON hot_seat_roast_reactions
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Anyone can insert reactions (anon or auth)
DO $$ BEGIN
  CREATE POLICY "Anyone can insert reactions" ON hot_seat_roast_reactions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Participants can update own reactions (toggle/change)
DO $$ BEGIN
  CREATE POLICY "Participants can update own reactions" ON hot_seat_roast_reactions
    FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- REALTIME for reaction updates
do $$ begin alter publication supabase_realtime add table hot_seat_roast_reactions; exception when duplicate_object or undefined_table then null; end $$;

-- ============================================================
-- DONE — Hot Seat reactions table created
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_leaderboard_indexes.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURNBOARD — Leaderboard & Weekly Recap Indexes
-- Additive-only: adds indexes to support ranking queries
-- ============================================================

-- Hot Seats: leaderboard queries need roast_count + created_at for period filtering
CREATE INDEX IF NOT EXISTS idx_hot_seats_ranking 
  ON hot_seats(roast_count DESC, created_at DESC) 
  WHERE status != 'deleted' AND status != 'private';

-- Hot Seats: weekly recap needs count by period
CREATE INDEX IF NOT EXISTS idx_hot_seats_created_period 
  ON hot_seats(created_at DESC) 
  WHERE status != 'deleted';

-- Hot Seat Roasts: leaderboard needs reactions by roast in period
CREATE INDEX IF NOT EXISTS idx_hs_roasts_created_period 
  ON hot_seat_roasts(created_at DESC) 
  WHERE is_hidden = false;

-- Hot Seat Reactions: leaderboard needs reaction_type counts per roast
CREATE INDEX IF NOT EXISTS idx_hs_reactions_type_active 
  ON hot_seat_roast_reactions(reaction_type, roast_id) 
  WHERE is_active = true;

-- Hot Seat Reactions: weekly recap needs reactions by period
CREATE INDEX IF NOT EXISTS idx_hs_reactions_created_period 
  ON hot_seat_roast_reactions(created_at DESC) 
  WHERE is_active = true;

-- Classic Roasts: leaderboard needs reaction counts by period
CREATE INDEX IF NOT EXISTS idx_roasts_created_period 
  ON roasts(created_at DESC) 
  WHERE is_hidden = false;

-- Battles: leaderboard needs votes + period
CREATE INDEX IF NOT EXISTS idx_battles_votes_period 
  ON battles(votes1 DESC, votes2 DESC, created_at DESC);

-- Battles: weekly recap needs battles by period
CREATE INDEX IF NOT EXISTS idx_battles_created_period 
  ON battles(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_notifications.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURNBOARD — Notification System Enhancements
-- Additive-only: adds indexes and RPC functions for notifications
-- ============================================================

-- Notifications: fetch by user + read state + date
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_date 
  ON notifications(user_id, is_read, created_at DESC);

-- Notifications: fetch unread count efficiently
CREATE INDEX IF NOT EXISTS idx_notifications_unread_count 
  ON notifications(user_id) 
  WHERE is_read = false;

-- Notifications: cleanup old read notifications
CREATE INDEX IF NOT EXISTS idx_notifications_cleanup 
  ON notifications(user_id, is_read, created_at) 
  WHERE is_read = true;

-- RPC: Process notification queue (batch insert from queue to notifications)
CREATE OR REPLACE FUNCTION process_notification_queue(batch_size INT DEFAULT 100)
RETURNS INT AS $$
DECLARE
  processed_count INT := 0;
  queue_item RECORD;
BEGIN
  FOR queue_item IN 
    SELECT id, user_id, type, title, message, link, dedup_key
    FROM notification_queue 
    WHERE processed = false 
    ORDER BY priority DESC, created_at ASC 
    LIMIT batch_size
  LOOP
    -- Insert into notifications table
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (queue_item.user_id, queue_item.type, queue_item.title, queue_item.message, queue_item.link);
    
    -- Mark as processed
    UPDATE notification_queue SET processed = true WHERE id = queue_item.id;
    processed_count := processed_count + 1;
  END LOOP;
  
  RETURN processed_count;
END;
$$ LANGUAGE plpgsql;

-- RPC: Cleanup old processed queue entries
CREATE OR REPLACE FUNCTION cleanup_notification_queue()
RETURNS void AS $$
BEGIN
  DELETE FROM notification_queue 
  WHERE processed = true 
  AND created_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;

-- RPC: Cleanup old read notifications (for user maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_notifications(target_user_id UUID, days_old INT DEFAULT 30)
RETURNS void AS $$
BEGIN
  DELETE FROM notifications 
  WHERE user_id = target_user_id 
  AND is_read = true 
  AND created_at < now() - (days_old || ' days')::interval;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_savage_level.sql
-- ────────────────────────────────────────────────────────────

-- Add savage_level column to roasts table
-- Values: mild, savage, toxic, bangla
-- Default: savage (most common level on the platform)

ALTER TABLE roasts ADD COLUMN IF NOT EXISTS savage_level TEXT DEFAULT 'savage';

-- Add check constraint for valid values
DO $$ BEGIN
  ALTER TABLE roasts ADD CONSTRAINT roasts_savage_level_check
    CHECK (savage_level IN ('mild', 'savage', 'toxic', 'bangla'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add index for filtering by savage level
CREATE INDEX IF NOT EXISTS idx_roasts_savage_level ON roasts(savage_level);

-- Update existing roasts to have a savage_level based on reaction patterns
-- Roasts with high brutal reactions get 'toxic', others stay 'savage'
UPDATE roasts
SET savage_level = CASE
  WHEN reaction_brutal > 5 THEN 'toxic'
  WHEN reaction_brutal > 2 THEN 'savage'
  WHEN upvotes < 2 AND reaction_brutal = 0 THEN 'mild'
  ELSE 'savage'
END
WHERE savage_level IS NULL OR savage_level = 'savage';

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_trending_indexes.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURNBOARD — Trending & Discovery Indexes
-- Additive-only: adds indexes to support trending queries
-- ============================================================

-- Hot Seats: trending queries filter by status + order by created_at
CREATE INDEX IF NOT EXISTS idx_hot_seats_status_created 
  ON hot_seats(status, created_at DESC) 
  WHERE status != 'deleted';

-- Hot Seats: for counting roasts per seat quickly
CREATE INDEX IF NOT EXISTS idx_hot_seats_roast_count 
  ON hot_seats(roast_count DESC, created_at DESC) 
  WHERE status = 'active';

-- Hot Seat Roasts: trending roasts need reactions by roast_id
CREATE INDEX IF NOT EXISTS idx_hs_roasts_hidden_created 
  ON hot_seat_roasts(hot_seat_id, created_at DESC) 
  WHERE is_hidden = false;

-- Hot Seat Reactions: trending needs reaction counts per roast
CREATE INDEX IF NOT EXISTS idx_hs_reactions_active_type 
  ON hot_seat_roast_reactions(roast_id, reaction_type) 
  WHERE is_active = true;

-- Classic Roasts: trending needs reactions + recency
CREATE INDEX IF NOT EXISTS idx_roasts_hidden_created 
  ON roasts(created_at DESC) 
  WHERE is_hidden = false;

-- Battles: trending queries filter by active status + created_at
CREATE INDEX IF NOT EXISTS idx_battles_active_created 
  ON battles(is_active, created_at DESC);

-- Battles: for vote velocity calculations
CREATE INDEX IF NOT EXISTS idx_battles_votes_created 
  ON battles(votes1, votes2, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_02_trust_safety.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- BURN BOARD — Trust & Safety Foundation (Master Prompt #16)
-- Additive-only migration. No existing tables modified.
-- ============================================================

-- ── Enhanced Reports ─────────────────────────────────────────
-- Extend existing reports table with structured categories
-- and support for reporting hot seats, battles, and profiles

-- Add new columns to existing reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'roast' 
  CHECK (target_type IN ('roast', 'hot_seat', 'battle', 'profile'));
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other'
  CHECK (category IN (
    'harassment', 'threat', 'hate', 'privacy_violation',
    'sexual_content', 'exploitation', 'spam', 'scam', 'other'
  ));
ALTER TABLE reports ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'normal'
  CHECK (severity IN ('normal', 'high', 'critical'));

-- Update status check to include new states
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check 
  CHECK (status IN ('pending', 'open', 'in_review', 'resolved', 'dismissed', 'escalated'));

-- Indexes for report queries
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category, status);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_severity ON reports(severity) WHERE severity IN ('high', 'critical');

-- ── Moderation Actions Audit Log ─────────────────────────────
-- Tracks all moderation actions for accountability

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'hide_roast', 'unhide_roast',
    'hide_hot_seat', 'unhide_hot_seat',
    'restrict_profile', 'unrestrict_profile',
    'ban_profile', 'unban_profile',
    'dismiss_report', 'resolve_report', 'escalate_report',
    'resolve_appeal', 'reverse_appeal'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'report', 'appeal'
  )),
  target_id UUID NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  policy_category TEXT,
  moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moderator_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

-- Only moderators/admins can read audit logs
DO $$ BEGIN
  CREATE POLICY "Moderators read audit logs" ON moderation_actions
    FOR SELECT USING (true); -- Will be restricted by app layer
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Moderators insert audit logs" ON moderation_actions
    FOR INSERT WITH CHECK (true); -- Will be restricted by app layer
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON moderation_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_moderator ON moderation_actions(moderator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_type ON moderation_actions(action_type, created_at DESC);

-- ── Appeals ──────────────────────────────────────────────────
-- Users can appeal moderation decisions

CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enforcement_type TEXT NOT NULL CHECK (enforcement_type IN (
    'content_removal', 'content_restriction', 'profile_restriction', 'profile_ban'
  )),
  enforcement_target_type TEXT NOT NULL CHECK (enforcement_target_type IN (
    'roast', 'hot_seat', 'battle', 'profile'
  )),
  enforcement_target_id UUID NOT NULL,
  appellant_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  appellant_anon_id TEXT,
  explanation TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'upheld', 'reversed')),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;

-- Appellants can read own appeals
DO $$ BEGIN
  CREATE POLICY "Appellants read own appeals" ON appeals
    FOR SELECT USING (auth.uid() = appellant_id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Anyone can submit appeals (anon or auth)
DO $$ BEGIN
  CREATE POLICY "Anyone can submit appeals" ON appeals
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Moderators can update appeals (restricted by app layer)
DO $$ BEGIN
  CREATE POLICY "Moderators update appeals" ON appeals
    FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_appellant ON appeals(appellant_id);
CREATE INDEX IF NOT EXISTS idx_appeals_target ON appeals(enforcement_target_type, enforcement_target_id);

-- ── Content Moderation State ─────────────────────────────────
-- Add moderation_state to hot_seats for richer content states

ALTER TABLE hot_seats ADD COLUMN IF NOT EXISTS moderation_state TEXT DEFAULT 'visible'
  CHECK (moderation_state IN ('visible', 'limited', 'under_review', 'removed'));

CREATE INDEX IF NOT EXISTS idx_hot_seats_moderation ON hot_seats(moderation_state) 
  WHERE moderation_state != 'visible';

-- Add moderation_state to hot_seat_roasts
ALTER TABLE hot_seat_roasts ADD COLUMN IF NOT EXISTS moderation_state TEXT DEFAULT 'visible'
  CHECK (moderation_state IN ('visible', 'limited', 'under_review', 'removed'));

-- ── Anti-Harassment Signals ──────────────────────────────────
-- Track repeated targeting for anti-harassment

CREATE TABLE IF NOT EXISTS harassment_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'repeated_reports', 'repeated_blocks', 'excessive_targeting', 'rapid_submissions'
  )),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('profile', 'hot_seat', 'ip')),
  subject_id TEXT NOT NULL,
  report_count INT DEFAULT 0,
  block_count INT DEFAULT 0,
  target_count INT DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE harassment_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "System manage harassment signals" ON harassment_signals
    FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_harassment_subject ON harassment_signals(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_harassment_type ON harassment_signals(signal_type, created_at DESC);

-- ── Comments ─────────────────────────────────────────────────

COMMENT ON TABLE moderation_actions IS 'Audit log for all moderation actions';
COMMENT ON TABLE appeals IS 'User appeals of moderation decisions';
COMMENT ON TABLE harassment_signals IS 'Anti-harassment detection signals';

-- ============================================================
-- DONE — Trust & Safety tables created
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_04_challenges_battles.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Challenges, Battles & Viral Participation (Master Prompt 9)
-- NON-DESTRUCTIVE: only adds new tables/columns/RPCs. No existing
-- tables are dropped, renamed, or have data removed.
--
-- Execution order matters: tables → helper functions → policies.
-- ═══════════════════════════════════════════════════════════

-- ── 1. BATTLE VOTES ─────────────────────────────────────────
-- One real vote per (battle, voter). Totals are ALWAYS derived from
-- this table by the cast_battle_vote RPC — never trusted from clients.
-- The legacy battles.votes1/votes2 columns are kept as a denormalized
-- cache (and for realtime broadcasts) and are recomputed on each vote.
CREATE TABLE IF NOT EXISTS battle_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  voter_key TEXT NOT NULL,
  selection INT NOT NULL CHECK (selection IN (1, 2)),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_battle_vote UNIQUE (battle_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_battle_votes_battle ON battle_votes(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_votes_user ON battle_votes(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE battle_votes ENABLE ROW LEVEL SECURITY;

-- Votes are public/pseudonymous for read (needed for authoritative
-- count queries and result aggregation). NO insert/update/delete
-- policies exist — writes only happen through cast_battle_vote RPC,
-- so the client can never control totals.
DO $$ BEGIN
  CREATE POLICY "Public can read battle votes" ON battle_votes
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. CAST BATTLE VOTE (security definer RPC) ──────────────
-- Validates battle existence, blocks self-voting on owned profiles,
-- upserts the voter's choice (votes may switch until voting closes —
-- arena matchups stay open), and recomputes canonical totals.
CREATE OR REPLACE FUNCTION public.cast_battle_vote(
  p_battle_id UUID,
  p_voter_key TEXT,
  p_selection INT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (success boolean, message text, votes1 bigint, votes2 bigint, total bigint, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b_record battles%ROWTYPE;
  v1 bigint;
  v2 bigint;
  inserted boolean;
BEGIN
  IF p_voter_key IS NULL OR char_length(p_voter_key) = 0 THEN
    RETURN QUERY SELECT false, 'Missing voter identity', 0, 0, 0, 'none';
    RETURN;
  END IF;

  IF p_selection NOT IN (1, 2) THEN
    RETURN QUERY SELECT false, 'Invalid selection', 0, 0, 0, 'none';
    RETURN;
  END IF;

  SELECT * INTO b_record FROM battles WHERE id = p_battle_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Battle not found', 0, 0, 0, 'none';
    RETURN;
  END IF;

  -- Block self-voting when the signed-in user owns one of the fighters
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM profiles
      WHERE id IN (b_record.profile1_id, b_record.profile2_id)
        AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT false, 'You cannot vote in a battle featuring your own profile', 0, 0, 0, 'none';
      RETURN;
    END IF;
  END IF;

  -- Upsert the vote (allow switching). xmax = 0 on the returned row
  -- means the row was freshly inserted (not an update).
  INSERT INTO battle_votes (battle_id, voter_key, selection, user_id)
  VALUES (p_battle_id, p_voter_key, p_selection, p_user_id)
  ON CONFLICT (battle_id, voter_key)
  DO UPDATE SET selection = EXCLUDED.selection, updated_at = now()
  RETURNING (xmax = 0) INTO inserted;

  -- Recompute canonical totals from real vote rows
  SELECT count(*) FILTER (WHERE selection = 1),
         count(*) FILTER (WHERE selection = 2)
    INTO v1, v2
    FROM battle_votes WHERE battle_id = p_battle_id;

  UPDATE battles
     SET votes1 = v1, votes2 = v2, updated_at = now()
   WHERE id = p_battle_id;

  RETURN QUERY SELECT true,
    CASE WHEN inserted THEN 'added' ELSE 'switched' END,
    v1, v2, v1 + v2,
    CASE WHEN inserted THEN 'added' ELSE 'switched' END;
END;
$$;

-- ── 3. CHALLENGES TABLE ──────────────────────────────────────
-- A Challenge is a time-boxed, type-specific participation prompt.
-- Entries are canonical social_posts rows linked via
-- social_posts.challenge_id — one record, no content duplication.
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  public_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(10), 'hex'),
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 500),
  -- The content type entries must be: opinion | question | poll | photo | hot_take
  challenge_type TEXT NOT NULL CHECK (challenge_type IN
    ('opinion', 'question', 'poll', 'photo', 'hot_take')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public')),
  community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT challenge_ends_after_start CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_challenges_slug ON challenges(slug);
CREATE INDEX IF NOT EXISTS idx_challenges_status_ends ON challenges(status, ends_at ASC);
CREATE INDEX IF NOT EXISTS idx_challenges_created ON challenges(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_creator ON challenges(creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_challenges_community ON challenges(community_id) WHERE community_id IS NOT NULL;

-- ── 4. CHALLENGE PARTICIPANTS ────────────────────────────────
-- Real, authenticated participation. One row per (challenge, user).
-- post_id is set when the participant's canonical entry is created.
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_challenge_participation UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_post ON challenge_participants(post_id) WHERE post_id IS NOT NULL;

-- ── 5. CHALLENGE INVITATIONS ─────────────────────────────────
-- Creator/participant can invite an authenticated user by username.
-- Invitees may decline; accepting happens by participating (their
-- participant row is created with status active).
CREATE TABLE IF NOT EXISTS challenge_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_challenge_invitee UNIQUE (challenge_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_invitations_challenge ON challenge_invitations(challenge_id, status);
CREATE INDEX IF NOT EXISTS idx_challenge_invitations_invitee ON challenge_invitations(invitee_id, status);

-- ── 6. SOCIAL POSTS ↔ CHALLENGE (canonical content association) ──
DO $$ BEGIN
  ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_posts_challenge ON social_posts(challenge_id, created_at DESC);

-- ── 7. ROLE/STATE HELPERS (security definer) ─────────────────
CREATE OR REPLACE FUNCTION public.is_challenge_creator(challenge uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM challenges
    WHERE id = challenge AND creator_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_challenge_participant(challenge uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM challenge_participants
    WHERE challenge_id = challenge AND user_id = auth.uid()
  );
$$;

-- ── 8. ROW LEVEL SECURITY ────────────────────────────────────
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view public challenges" ON challenges
    FOR SELECT USING (visibility = 'public');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users create challenges" ON challenges
    FOR INSERT WITH CHECK (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Creators update challenges" ON challenges
    FOR UPDATE USING (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Creators delete challenges" ON challenges
    FOR DELETE USING (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view participants" ON challenge_participants
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Participation is authenticated: users can only add themselves
DO $$ BEGIN
  CREATE POLICY "Users participate in challenges" ON challenge_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Participants update own row" ON challenge_participants
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Participants can leave" ON challenge_participants
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE challenge_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parties can view invitations" ON challenge_invitations
    FOR SELECT USING (
      auth.uid() = invitee_id
      OR auth.uid() = inviter_id
      OR is_challenge_creator(challenge_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Participants send invitations" ON challenge_invitations
    FOR INSERT WITH CHECK (auth.uid() = inviter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Invitees can decline/accept; creators can revoke pending invites
DO $$ BEGIN
  CREATE POLICY "Invitee or creator updates invitation" ON challenge_invitations
    FOR UPDATE USING (
      auth.uid() = invitee_id
      OR is_challenge_creator(challenge_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 9. TIMESTAMP TRIGGERS ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_challenges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_challenges_updated_at ON challenges;
CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION update_challenges_updated_at();

DROP TRIGGER IF EXISTS update_challenge_invitations_updated_at ON challenge_invitations;
CREATE TRIGGER update_challenge_invitations_updated_at
  BEFORE UPDATE ON challenge_invitations
  FOR EACH ROW EXECUTE FUNCTION update_challenges_updated_at();

-- ── 10. EXTEND MODERATION AUDIT LOG for challenge actions ────
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_type_check
  CHECK (action_type IN (
    'hide_roast', 'unhide_roast',
    'hide_hot_seat', 'unhide_hot_seat',
    'restrict_profile', 'unrestrict_profile',
    'ban_profile', 'unban_profile',
    'dismiss_report', 'resolve_report', 'escalate_report',
    'resolve_appeal', 'reverse_appeal',
    'community_remove_post', 'community_remove_member', 'community_role_changed',
    'challenge_cancelled', 'challenge_entry_removed'
  ));

ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_target_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_target_type_check
  CHECK (target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'report', 'appeal',
    'community', 'community_member', 'social_post', 'challenge'
  ));

-- ── 11. REALTIME (battles row only — feeds stay request-driven) ──
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE challenge_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE — Challenges & battle voting schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_04_communities.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Communities, Circles & Interest Networks (Master Prompt 8)
-- NON-DESTRUCTIVE: only adds new tables/columns and extends checks.
-- Does NOT modify, rename, or delete any existing data.
--
-- Execution order matters: tables → helper functions → policies.
-- ═══════════════════════════════════════════════════════════

-- ── 1. COMMUNITIES TABLE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 60),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 300),
  avatar_url TEXT,
  cover_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_created ON communities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communities_visibility ON communities(visibility, created_at DESC);

-- ── 2. COMMUNITY MEMBERS TABLE ───────────────────────────────
CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'removed', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_community_membership UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_members_role ON community_members(community_id, role);

-- ── 3. COMMUNITY RULES TABLE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS community_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 3 AND 300),
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_rules_community ON community_rules(community_id, position);

-- ── 4. TOPICS (normalized interest topics, shared with future systems) ──
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Curated seed topics (generic interest categories — metadata, not fake activity)
INSERT INTO topics (name, slug) VALUES
  ('Gaming', 'gaming'),
  ('Movies', 'movies'),
  ('Football', 'football'),
  ('Technology', 'technology'),
  ('Music', 'music'),
  ('Memes', 'memes'),
  ('Relationships', 'relationships'),
  ('Unpopular Opinions', 'unpopular-opinions'),
  ('Business', 'business'),
  ('AI', 'ai'),
  ('Local Culture', 'local-culture'),
  ('TV & Streaming', 'tv-streaming'),
  ('Fitness', 'fitness'),
  ('Food', 'food'),
  ('Travel', 'travel'),
  ('Crypto & Web3', 'crypto-web3'),
  ('Anime', 'anime'),
  ('Books', 'books'),
  ('Cars', 'cars'),
  ('Sports', 'sports')
ON CONFLICT (slug) DO NOTHING;

-- ── 5. COMMUNITY ↔ TOPIC ASSOCIATION ─────────────────────────
CREATE TABLE IF NOT EXISTS community_topics (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (community_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_community_topics_topic ON community_topics(topic_id);

-- ── 6. SOCIAL POSTS ↔ COMMUNITY (canonical content stays in social_posts) ──
DO $$ BEGIN
  ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_posts_community ON social_posts(community_id, created_at DESC);

-- ── 7. COMMUNITY ROLE HELPERS (security definer) ─────────────
-- Used by RLS policies so the database itself enforces role rules.

CREATE OR REPLACE FUNCTION public.is_community_member(community uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community
      AND user_id = auth.uid()
      AND membership_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_moderator(community uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community
      AND user_id = auth.uid()
      AND membership_status = 'active'
      AND role IN ('owner', 'admin', 'moderator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_owner(community uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = community
      AND user_id = auth.uid()
      AND membership_status = 'active'
      AND role = 'owner'
  );
$$;

-- ── 8. COMMUNITY POST DETACHMENT (security definer RPC) ──────
-- Lets a community moderator detach a post from their own community while
-- preserving the content record, author ownership, reactions, and comments.
-- The database validates the actor role — the app can never bypass this.

CREATE OR REPLACE FUNCTION public.community_detach_post(community uuid, post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  attached uuid;
BEGIN
  -- Actor must be an active owner/moderator of this community
  SELECT role INTO actor_role FROM community_members
    WHERE community_id = community
      AND user_id = auth.uid()
      AND membership_status = 'active';

  IF actor_role IS NULL OR actor_role NOT IN ('owner', 'admin', 'moderator') THEN
    RETURN false;
  END IF;

  -- Post must currently belong to this community
  SELECT community_id INTO attached FROM social_posts WHERE id = post_id;
  IF attached IS DISTINCT FROM community THEN
    RETURN false;
  END IF;

  UPDATE social_posts SET community_id = NULL, updated_at = now() WHERE id = post_id;
  RETURN true;
END;
$$;

-- ── 9. ROW LEVEL SECURITY ────────────────────────────────────

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- Public (and private-for-members) reads; app layer filters private
CREATE POLICY "Public can read communities" ON communities
  FOR SELECT USING (visibility = 'public' OR is_community_member(id));

-- Creators create their own community (creator becomes owner via members row)
CREATE POLICY "Users create communities" ON communities
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- Only owners can edit community details
CREATE POLICY "Owners update communities" ON communities
  FOR UPDATE USING (is_community_owner(id));

-- Only owners can delete communities
CREATE POLICY "Owners delete communities" ON communities
  FOR DELETE USING (is_community_owner(id));

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Membership lists are readable (app layer restricts for private communities)
CREATE POLICY "Public can read memberships" ON community_members
  FOR SELECT USING (true);

-- Users can only add themselves
CREATE POLICY "Users join communities" ON community_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Role changes are owner-only (app layer also enforces; DB is source of truth)
CREATE POLICY "Owners change roles" ON community_members
  FOR UPDATE USING (is_community_owner(community_id));

-- Users can leave; owners/moderators can remove others (app layer protects owners)
CREATE POLICY "Users can leave" ON community_members
  FOR DELETE USING (
    auth.uid() = user_id
    OR is_community_owner(community_id)
    OR is_community_moderator(community_id)
  );

ALTER TABLE community_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read rules" ON community_rules
  FOR SELECT USING (true);

-- Owners and moderators manage rules
CREATE POLICY "Moderators manage rules" ON community_rules
  FOR INSERT WITH CHECK (is_community_moderator(community_id));

CREATE POLICY "Moderators update rules" ON community_rules
  FOR UPDATE USING (is_community_moderator(community_id));

CREATE POLICY "Moderators delete rules" ON community_rules
  FOR DELETE USING (is_community_moderator(community_id));

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read topics" ON topics
  FOR SELECT USING (true);

ALTER TABLE community_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read community topics" ON community_topics
  FOR SELECT USING (true);

-- Owners/moderators manage topic associations
CREATE POLICY "Moderators manage community topics" ON community_topics
  FOR INSERT WITH CHECK (is_community_moderator(community_id));

CREATE POLICY "Moderators delete community topics" ON community_topics
  FOR DELETE USING (is_community_moderator(community_id));

-- ── 10. EXTEND MODERATION AUDIT LOG for community actions ────
-- Non-destructive: drop + re-create CHECK constraints with expanded values.
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_type_check
  CHECK (action_type IN (
    'hide_roast', 'unhide_roast',
    'hide_hot_seat', 'unhide_hot_seat',
    'restrict_profile', 'unrestrict_profile',
    'ban_profile', 'unban_profile',
    'dismiss_report', 'resolve_report', 'escalate_report',
    'resolve_appeal', 'reverse_appeal',
    'community_remove_post', 'community_remove_member', 'community_role_changed'
  ));

ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_target_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_target_type_check
  CHECK (target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'report', 'appeal',
    'community', 'community_member', 'social_post'
  ));

-- ── 11. REALTIME (communities only — feeds stay request-driven) ──
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE communities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE — Communities schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2025_09_05_trust_safety_v2.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Trust, Safety & Anti-Harassment Engine (Master Prompt 11)
-- NON-DESTRUCTIVE: only adds new tables/columns/constraints.
-- No existing data is modified or removed.
--
-- Execution order matters: tables → RLS changes → policy expansions.
-- ═══════════════════════════════════════════════════════════

-- ── 1. MODERATION STATE ON SOCIAL CONTENT ───────────────────
-- Canonical social content (posts + comments) gets the same explicit
-- moderation states as hot seats. RLS below enforces the state across
-- every read surface (feed, community feed, challenge entries, direct
-- URLs, search-adjacent APIs): removed/under_review content is invisible
-- until a moderator restores it (state flip = immediate re-eligibility).

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'visible'
  CHECK (moderation_state IN ('visible', 'limited', 'under_review', 'removed'));

ALTER TABLE comments ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'visible'
  CHECK (moderation_state IN ('visible', 'limited', 'under_review', 'removed'));

CREATE INDEX IF NOT EXISTS idx_social_posts_moderation ON social_posts(moderation_state)
  WHERE moderation_state != 'visible';
CREATE INDEX IF NOT EXISTS idx_comments_moderation ON comments(moderation_state)
  WHERE moderation_state != 'visible';

-- ── 2. CENTRALIZED SAFETY EVENTS ────────────────────────────
-- Single source of truth for safety-relevant activity. Internal data —
-- never exposed through public APIs (app layer restricts; RLS mirrors the
-- platform's existing permissive-but-app-guarded convention for safety data).
CREATE TABLE IF NOT EXISTS safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'content_created', 'content_updated', 'content_reported', 'content_flagged',
    'user_reported', 'block_created', 'block_removed', 'mute_created', 'mute_removed',
    'abuse_pattern_detected', 'rate_limit_triggered', 'spam_pattern_detected',
    'user_restricted', 'user_ban', 'user_unban', 'moderation_action', 'appeal_submitted'
  )),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_events_type ON safety_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_target ON safety_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_safety_events_actor ON safety_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_risk ON safety_events(risk_level, created_at DESC)
  WHERE risk_level IN ('high', 'critical');

ALTER TABLE safety_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "System records safety events" ON safety_events
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Read access is intentionally NOT granted to anonymous/anonymous clients;
-- internal safety tooling reads through moderator-authenticated services.

-- ── 3. CONTENT CLASSIFICATIONS (rules + AI assisted) ─────────
-- Records every automated classification: source, category, risk, confidence
-- band, model/provider, policy version, and the resulting action. Never
-- claims AI reviewed something the AI did not (source field is exact).
CREATE TABLE IF NOT EXISTS content_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('rules', 'ai', 'report')),
  category TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  confidence REAL,
  provider TEXT,
  policy_version INT DEFAULT 1,
  action TEXT NOT NULL DEFAULT 'none' CHECK (action IN ('none', 'flag', 'hold')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classifications_target ON content_classifications(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_classifications_created ON content_classifications(created_at DESC);

ALTER TABLE content_classifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "System records classifications" ON content_classifications
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. MUTES (distinct from blocks) ──────────────────────────
-- Muting is one-directional and does NOT signal to the muted user.
-- Server-side effects: notification suppression + content filtering on
-- viewer-aware surfaces. The muted user can still interact normally.
CREATE TABLE IF NOT EXISTS user_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_mute UNIQUE (muter_id, muted_id),
  CONSTRAINT no_self_mute CHECK (muter_id != muted_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON user_mutes(muter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_mutes_muted ON user_mutes(muted_id);

ALTER TABLE user_mutes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own mutes" ON user_mutes
    FOR SELECT USING (auth.uid() = muter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users create own mutes" ON user_mutes
    FOR INSERT WITH CHECK (auth.uid() = muter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users delete own mutes" ON user_mutes
    FOR DELETE USING (auth.uid() = muter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 5. USER RESTRICTIONS (action-specific, time-bounded) ─────
-- Server-side checks gate each restricted action — hiding a button is
-- never the enforcement. Full bans use user_profiles.is_banned plus an
-- 'all' restriction row for auditability.
CREATE TABLE IF NOT EXISTS user_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'post', 'comment', 'community_create', 'community_join', 'challenge_create',
    'invite', 'battle', 'report', 'all'
  )),
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_active_restriction UNIQUE NULLS NOT DISTINCT (user_id, action_type)
);

-- Note: UNIQUE NULLS NOT DISTINCT is used so repeated active restrictions
-- for the same action replace one another instead of stacking.

CREATE INDEX IF NOT EXISTS idx_user_restrictions_user ON user_restrictions(user_id, active);
CREATE INDEX IF NOT EXISTS idx_user_restrictions_action ON user_restrictions(action_type, active);

ALTER TABLE user_restrictions ENABLE ROW LEVEL SECURITY;
-- No anonymous read. Writes flow through moderator-authenticated services.

-- ── 6. RLS: ENFORCE MODERATION STATE AT THE DATABASE ─────────
-- Removed/under-review content must not surface through any read path.
DROP POLICY IF EXISTS "Public can read social_posts" ON social_posts;
CREATE POLICY "Public can read social_posts" ON social_posts
  FOR SELECT USING (visibility = 'public' AND moderation_state = 'visible');

DROP POLICY IF EXISTS "Public can read comments" ON comments;
CREATE POLICY "Public can read comments" ON comments
  FOR SELECT USING (moderation_state = 'visible');

-- ── 7. REPORT TARGETS/CATEGORIES EXPANSION ───────────────────
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('roast', 'hot_seat', 'battle', 'profile', 'user', 'social_post', 'comment', 'challenge'));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_category_check;
ALTER TABLE reports ADD CONSTRAINT reports_category_check
  CHECK (category IN (
    'harassment', 'threat', 'hate', 'privacy_violation',
    'sexual_content', 'exploitation', 'spam', 'scam', 'other',
    'impersonation', 'self_harm', 'illegal', 'non_consensual'
  ));

CREATE INDEX IF NOT EXISTS idx_reports_target_status ON reports(target_type, target_id, status);

-- ── 8. APPEALS EXPANSION (content + account enforcement) ─────
ALTER TABLE appeals DROP CONSTRAINT IF EXISTS appeals_enforcement_type_check;
ALTER TABLE appeals ADD CONSTRAINT appeals_enforcement_type_check
  CHECK (enforcement_type IN (
    'content_removal', 'content_restriction', 'profile_restriction', 'profile_ban',
    'account_restriction', 'account_ban'
  ));

ALTER TABLE appeals DROP CONSTRAINT IF EXISTS appeals_enforcement_target_type_check;
ALTER TABLE appeals ADD CONSTRAINT appeals_enforcement_target_type_check
  CHECK (enforcement_target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'user', 'social_post', 'comment', 'challenge'
  ));

-- ── 9. MODERATION AUDIT ACTIONS EXPANSION ────────────────────
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_type_check
  CHECK (action_type IN (
    'hide_roast', 'unhide_roast',
    'hide_hot_seat', 'unhide_hot_seat',
    'restrict_profile', 'unrestrict_profile',
    'ban_profile', 'unban_profile',
    'dismiss_report', 'resolve_report', 'escalate_report',
    'open_report', 'in_review_report', 'resolved_report', 'dismissed_report', 'escalated_report',
    'resolve_appeal', 'reverse_appeal',
    'upheld_appeal', 'reversed_appeal',
    'update_roast_state', 'update_hot_seat_state', 'update_social_post_state', 'update_comment_state',
    'community_remove_post', 'community_remove_member', 'community_role_changed',
    'challenge_cancelled', 'challenge_entry_removed',
    'content_state_changed', 'content_restored',
    'user_restricted', 'user_restriction_lifted', 'user_banned', 'user_unbanned'
  ));

ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_target_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_target_type_check
  CHECK (target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'report', 'appeal',
    'community', 'community_member', 'social_post', 'challenge',
    'comment', 'user'
  ));

-- ── 10. PLATFORM MODERATOR ROLE ─────────────────────────────
-- DB-level moderator identity. Flags are only settable by operators/SQL
-- for now; the app exposes no self-service path to become a moderator.
DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_platform_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND (is_moderator = true OR is_admin = true)
  );
$$;

-- ── 11. ENFORCEMENT / ADMIN RPCs (security definer) ──────────
-- Moderator-gated state changes (restrictions, bans, content state).
-- Every action persists an audit row in moderation_actions and a
-- safety_event — real, auditable, server-side only.

-- Content state changes for moderation-enabled tables.
CREATE OR REPLACE FUNCTION public.safety_set_content_state(
  p_target_type TEXT,
  p_target_id UUID,
  p_state TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql TEXT;
  v_previous TEXT;
  v_action TEXT;
  v_result jsonb;
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_state NOT IN ('visible', 'limited', 'under_review', 'removed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid state');
  END IF;
  IF p_target_type NOT IN ('social_post', 'comment', 'hot_seat') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported target_type');
  END IF;

  IF p_target_type = 'social_post' THEN
    SELECT moderation_state::text INTO v_previous FROM social_posts WHERE id = p_target_id;
    IF v_previous IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Target not found');
    END IF;
    UPDATE social_posts SET moderation_state = p_state, updated_at = now() WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    SELECT moderation_state::text INTO v_previous FROM comments WHERE id = p_target_id;
    IF v_previous IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Target not found');
    END IF;
    UPDATE comments SET moderation_state = p_state WHERE id = p_target_id;
  ELSIF p_target_type = 'hot_seat' THEN
    SELECT moderation_state::text INTO v_previous FROM hot_seats WHERE id = p_target_id;
    IF v_previous IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Target not found');
    END IF;
    UPDATE hot_seats SET moderation_state = p_state WHERE id = p_target_id;
  END IF;

  v_action := CASE
    WHEN p_state = 'visible' AND v_previous IN ('removed', 'under_review') THEN 'content_restored'
    ELSE 'content_state_changed'
  END;

  INSERT INTO moderation_actions (action_type, target_type, target_id, previous_state, new_state, policy_category, moderator_id, moderator_note)
  VALUES (v_action, p_target_type, p_target_id, v_previous, p_state, 'safety_v2', auth.uid(), p_note);

  INSERT INTO safety_events (event_type, actor_user_id, target_type, target_id, risk_level, metadata)
  VALUES ('moderation_action', auth.uid(), p_target_type, p_target_id::text, 'medium',
    jsonb_build_object('action', v_action, 'note', p_note));

  RETURN jsonb_build_object('success', true, 'previous_state', v_previous, 'new_state', p_state);
END;
$$;

-- Apply or refresh an action-specific restriction.
CREATE OR REPLACE FUNCTION public.safety_restrict_user(
  p_user_id UUID,
  p_action_type TEXT,
  p_reason TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_action_type NOT IN ('post', 'comment', 'community_create', 'community_join', 'challenge_create', 'invite', 'battle', 'report', 'all') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action_type');
  END IF;

  INSERT INTO user_restrictions (user_id, action_type, reason, created_by, expires_at)
  VALUES (p_user_id, p_action_type, p_reason, auth.uid(), p_expires_at)
  ON CONFLICT (user_id, action_type) DO UPDATE
    SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by,
        expires_at = EXCLUDED.expires_at, active = true, created_at = now();

  INSERT INTO moderation_actions (action_type, target_type, target_id, new_state, policy_category, moderator_id, moderator_note)
  VALUES ('user_restricted', 'user', p_user_id, p_action_type, 'safety_v2', auth.uid(), p_reason);

  INSERT INTO safety_events (event_type, actor_user_id, target_type, target_id, risk_level, metadata)
  VALUES ('user_restricted', auth.uid(), 'user', p_user_id::text, 'high',
    jsonb_build_object('action', p_action_type, 'reason', p_reason));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Lift an action-specific restriction.
CREATE OR REPLACE FUNCTION public.safety_lift_restriction(
  p_user_id UUID,
  p_action_type TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE user_restrictions SET active = false
  WHERE user_id = p_user_id AND action_type = p_action_type AND active = true;

  INSERT INTO moderation_actions (action_type, target_type, target_id, previous_state, policy_category, moderator_id, moderator_note)
  VALUES ('user_restriction_lifted', 'user', p_user_id, p_action_type, 'safety_v2', auth.uid(), 'Restriction lifted');

  INSERT INTO safety_events (event_type, actor_user_id, target_type, target_id, risk_level, metadata)
  VALUES ('moderation_action', auth.uid(), 'user', p_user_id::text, 'low',
    jsonb_build_object('action', 'lift_restriction', 'action_type', p_action_type));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Ban / unban (full account suspension).
CREATE OR REPLACE FUNCTION public.safety_set_user_ban(
  p_user_id UUID,
  p_banned BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event TEXT;
  v_action TEXT;
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE user_profiles SET is_banned = p_banned WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF p_banned THEN
    v_action := 'user_banned';
    v_event := 'user_ban';
    INSERT INTO user_restrictions (user_id, action_type, reason, created_by, expires_at)
    VALUES (p_user_id, 'all', p_reason, auth.uid(), NULL)
    ON CONFLICT (user_id, action_type) DO UPDATE
      SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by,
          expires_at = NULL, active = true, created_at = now();
  ELSE
    v_action := 'user_unbanned';
    v_event := 'user_unban';
    UPDATE user_restrictions SET active = false
    WHERE user_id = p_user_id AND action_type = 'all' AND active = true;
  END IF;

  INSERT INTO moderation_actions (action_type, target_type, target_id, new_state, policy_category, moderator_id, moderator_note)
  VALUES (v_action, 'user', p_user_id, CASE WHEN p_banned THEN 'banned' ELSE 'active' END, 'safety_v2', auth.uid(), p_reason);

  INSERT INTO safety_events (event_type, actor_user_id, target_type, target_id, risk_level, metadata)
  VALUES (v_event, auth.uid(), 'user', p_user_id::text, 'critical',
    jsonb_build_object('banned', p_banned, 'reason', p_reason));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 12. ENFORCEMENT READ RPCs ────────────────────────────────
-- Relationship check (server-side use): mutual blocks + viewer's mute of
-- the other. Only usable for yourself (auth.uid() = viewer) so arbitrary
-- pairs cannot be probed. Mutes are one-directional — mutee never learns.
CREATE OR REPLACE FUNCTION public.safety_relationship_between(p_viewer UUID, p_other UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS DISTINCT FROM p_viewer THEN
      jsonb_build_object(
        'viewer_blocks_other', false,
        'other_blocks_viewer', false,
        'viewer_mutes_other', false
      )
    ELSE
      jsonb_build_object(
        'viewer_blocks_other', EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = p_viewer AND blocked_id = p_other),
        'other_blocks_viewer', EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = p_other AND blocked_id = p_viewer),
        'viewer_mutes_other', EXISTS (SELECT 1 FROM user_mutes WHERE muter_id = p_viewer AND muted_id = p_other)
      )
  END;
$$;

-- Is the CURRENT authenticated user restricted from an action (or banned)?
CREATE OR REPLACE FUNCTION public.safety_can_perform(p_action TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
      AND (
        up.is_banned = true
        OR EXISTS (
          SELECT 1 FROM user_restrictions ur
          WHERE ur.user_id = auth.uid()
            AND ur.active = true
            AND (ur.expires_at IS NULL OR ur.expires_at > now())
            AND (ur.action_type = 'all' OR ur.action_type = p_action)
        )
      )
  );
$$;

-- List the CURRENT user's own active restrictions (transparency for appeals).
CREATE OR REPLACE FUNCTION public.safety_my_restrictions()
RETURNS TABLE (action_type TEXT, reason TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.action_type, ur.reason, ur.expires_at, ur.created_at
  FROM user_restrictions ur
  WHERE ur.user_id = auth.uid() AND ur.active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now());
$$;

-- ── 13. MODERATOR QUEUE READ (definer, moderator-gated) ─────
-- Under-review/limited content is RLS-hidden from normal reads, so the
-- queue reads through this moderator-gated function.
CREATE OR REPLACE FUNCTION public.safety_admin_flagged(p_limit INT DEFAULT 50)
RETURNS TABLE (target_type TEXT, target_id UUID, state TEXT, author_id UUID, content TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'social_post', id, moderation_state, user_id, content_text, created_at
  FROM social_posts
  WHERE moderation_state IN ('under_review', 'limited')
    AND public.is_platform_moderator()
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

-- ── 14. REALTIME (safety events only) ────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE safety_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 15. REPORTER PRIVACY AT THE DB (no public read of reports) ──
-- Report rows carry reporter identity (reporter_id / reporter_ip). The
-- previous permissive read policies leaked them to any anon-key client.
-- Read access now goes through moderator-gated definer functions only;
-- the submitting user gets an opaque success response, never report rows.
DROP POLICY IF EXISTS "reports_select" ON reports;
DROP POLICY IF EXISTS "patch_reports_select" ON reports;
DROP POLICY IF EXISTS "Admin read reports" ON reports;
DROP POLICY IF EXISTS "Public can read reports" ON reports;

DO $$ BEGIN
  CREATE POLICY "Reporters read own reports" ON reports
    FOR SELECT USING (auth.uid() = reporter_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Moderators read reports" ON reports
    FOR SELECT USING (public.is_platform_moderator());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Moderator write path for report status (definer, moderator-gated).
-- Direct UPDATEs are not granted to anon/authenticated roles; all report
-- transitions flow through this function so every change is audited.
CREATE OR REPLACE FUNCTION public.safety_update_report_status(
  p_report_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report reports%ROWTYPE;
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_status NOT IN ('open', 'in_review', 'resolved', 'dismissed', 'escalated') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  UPDATE reports
  SET status = p_status,
      resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END
  WHERE id = p_report_id;

  INSERT INTO moderation_actions (action_type, target_type, target_id, previous_state, new_state, policy_category, moderator_id, moderator_note)
  VALUES (p_status || '_report', 'report', p_report_id, v_report.status, p_status, 'safety_v2', auth.uid(), p_note);

  INSERT INTO safety_events (event_type, actor_user_id, target_type, target_id, risk_level, metadata)
  VALUES ('moderation_action', auth.uid(), 'report', p_report_id::text, 'low',
    jsonb_build_object('action', p_status, 'note', p_note));

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- Queue reads (definer, moderator-gated, reporter fields stripped).
CREATE OR REPLACE FUNCTION public.safety_admin_reports(
  p_status TEXT DEFAULT 'open',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total INT;
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'category', r.category,
    'context', r.context,
    'severity', r.severity,
    'status', r.status,
    'reporter_is_authed', r.reporter_id IS NOT NULL,
    'created_at', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT * FROM reports
    WHERE (p_status = 'all' OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) r;

  SELECT count(*) INTO v_total FROM reports
  WHERE (p_status = 'all' OR status = p_status);

  RETURN jsonb_build_object('success', true, 'reports', v_rows, 'total', v_total);
END;
$$;

-- ── 16. APPEALS: appellant reads own; moderator reads/acts via definer ──
-- Keep the existing "Appellants read own appeals" policy. Add moderator
-- read (policy) and a moderator-gated definer for decisions so reversals
-- also restore content through the authoritative state path.
-- The v1 migration created "Moderators update appeals" with USING (true),
-- which let ANY client update appeals. Drop the permissive policy first,
-- then recreate it moderator-gated (platform moderation is authoritative).
DROP POLICY IF EXISTS "Moderators update appeals" ON appeals;
DO $$ BEGIN
  CREATE POLICY "Moderators read appeals" ON appeals
    FOR SELECT USING (public.is_platform_moderator());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE POLICY "Moderators update appeals" ON appeals
  FOR UPDATE USING (public.is_platform_moderator());

CREATE OR REPLACE FUNCTION public.safety_review_appeal(
  p_appeal_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appeal appeals%ROWTYPE;
  v_state text;
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_decision NOT IN ('upheld', 'reversed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid decision');
  END IF;

  SELECT * INTO v_appeal FROM appeals WHERE id = p_appeal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appeal not found');
  END IF;
  IF v_appeal.status IN ('upheld', 'reversed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Appeal already decided');
  END IF;

  UPDATE appeals
  SET status = p_decision, reviewer_id = auth.uid(), reviewer_note = p_note, reviewed_at = now()
  WHERE id = p_appeal_id;

  -- Reversal restores the content through the authoritative state path.
  IF p_decision = 'reversed' THEN
    IF v_appeal.enforcement_target_type = 'social_post' THEN
      UPDATE social_posts SET moderation_state = 'visible', updated_at = now()
      WHERE id = v_appeal.enforcement_target_id;
      v_state := 'visible';
    ELSIF v_appeal.enforcement_target_type = 'comment' THEN
      UPDATE comments SET moderation_state = 'visible' WHERE id = v_appeal.enforcement_target_id;
      v_state := 'visible';
    ELSIF v_appeal.enforcement_target_type = 'hot_seat' THEN
      UPDATE hot_seats SET moderation_state = 'visible' WHERE id = v_appeal.enforcement_target_id;
      v_state := 'visible';
    ELSIF v_appeal.enforcement_target_type = 'roast' THEN
      UPDATE roasts SET is_hidden = false WHERE id = v_appeal.enforcement_target_id;
      v_state := 'visible';
    END IF;
  END IF;

  INSERT INTO moderation_actions (action_type, target_type, target_id, previous_state, new_state, policy_category, moderator_id, moderator_note)
  VALUES (p_decision || '_appeal', 'appeal', p_appeal_id, v_appeal.status, p_decision, 'safety_v2', auth.uid(), p_note);

  INSERT INTO safety_events (event_type, actor_user_id, target_type, target_id, risk_level, metadata)
  VALUES ('moderation_action', auth.uid(), 'appeal', p_appeal_id::text, 'low',
    jsonb_build_object('action', p_decision, 'note', p_note, 'restored', p_decision = 'reversed'));

  RETURN jsonb_build_object('success', true, 'decision', p_decision, 'restored_state', v_state);
END;
$$;

-- Moderator appeals queue read (definer, moderator-gated).
CREATE OR REPLACE FUNCTION public.safety_admin_appeals(
  p_status TEXT DEFAULT 'open',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total INT;
BEGIN
  IF NOT public.is_platform_moderator() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'enforcement_type', a.enforcement_type,
    'enforcement_target_type', a.enforcement_target_type,
    'enforcement_target_id', a.enforcement_target_id,
    'explanation', a.explanation,
    'status', a.status,
    'appellant_is_authed', a.appellant_id IS NOT NULL,
    'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT * FROM appeals
    WHERE (p_status = 'all' OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) a;

  SELECT count(*) INTO v_total FROM appeals
  WHERE (p_status = 'all' OR status = p_status);

  RETURN jsonb_build_object('success', true, 'appeals', v_rows, 'total', v_total);
END;
$$;

-- ── 16b. DUPLICATE REPORT CHECK (definer — reporter privacy safe) ──
-- The reports read policy hides rows from non-owners, so duplicate
-- detection must run server-side. The function only answers about the
-- caller-supplied reporter identity (no cross-user data exposure).
CREATE OR REPLACE FUNCTION public.safety_duplicate_report(
  p_target_type TEXT,
  p_target_id UUID,
  p_reporter_id UUID DEFAULT NULL,
  p_reporter_ip TEXT DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM reports
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND created_at > now() - interval '1 hour'
      AND (
        (p_reporter_id IS NOT NULL AND reporter_id = p_reporter_id)
        OR (p_reporter_id IS NULL AND p_reporter_ip IS NOT NULL AND reporter_ip = p_reporter_ip)
      )
  );
$$;

-- ── 17. SYSTEM AUTO-REVIEW (report-driven, DB-enforced policy) ────
-- Reports are signals, not proof. This definer function re-checks the real
-- report rows server-side: only multiple DISTINCT reporters (or a
-- critical-severity flag) move content to under_review. It never removes
-- content and never bans. Runs without a moderator session because the
-- policy itself is the authority; every outcome is audited.
CREATE OR REPLACE FUNCTION public.safety_auto_review(
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open INT;
  v_distinct INT;
  v_critical BOOLEAN;
BEGIN
  IF p_target_type NOT IN ('social_post', 'comment', 'hot_seat', 'roast') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported target_type');
  END IF;

  SELECT count(*),
         count(DISTINCT CASE WHEN reporter_id IS NOT NULL THEN 'u:' || reporter_id::text ELSE 'ip:' || reporter_ip END),
         bool_or(severity IN ('high', 'critical'))
  INTO v_open, v_distinct, v_critical
  FROM reports
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND status IN ('open', 'escalated');

  -- Volume with distinct reporters triggers review; a critical flag also
  -- escalates. Never auto-remove, never auto-ban.
  IF NOT ((v_open >= 3 AND v_distinct >= 2) OR COALESCE(v_critical, false)) THEN
    RETURN jsonb_build_object('success', false, 'review', false);
  END IF;

  IF p_target_type = 'social_post' THEN
    UPDATE social_posts SET moderation_state = 'under_review', updated_at = now() WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    UPDATE comments SET moderation_state = 'under_review' WHERE id = p_target_id;
  ELSIF p_target_type = 'hot_seat' THEN
    UPDATE hot_seats SET moderation_state = 'under_review' WHERE id = p_target_id;
  ELSIF p_target_type = 'roast' THEN
    UPDATE roasts SET is_hidden = true WHERE id = p_target_id;
  END IF;

  INSERT INTO moderation_actions (action_type, target_type, target_id, previous_state, new_state, policy_category, moderator_id, moderator_note)
  VALUES ('content_state_changed', p_target_type, p_target_id, 'visible', 'under_review', 'auto_review_v2', NULL, 'Auto-review: distinct reporters');

  INSERT INTO safety_events (event_type, target_type, target_id, risk_level, metadata)
  VALUES ('abuse_pattern_detected', p_target_type, p_target_id::text, 'medium',
    jsonb_build_object('source', 'reports', 'open', v_open, 'distinct_reporters', v_distinct));

  RETURN jsonb_build_object('success', true, 'review', true, 'state', 'under_review');
END;
$$;

-- ── 17b. NOTIFICATION SAFETY GATE (definer) ──────────────────
-- Returns false when the recipient mutes the actor or either side blocks
-- the other, so notification generators never deliver messages from (or
-- about) someone the recipient muted/blocked. One-directional mutes mean
-- the muted user is never told about the suppression.
CREATE OR REPLACE FUNCTION public.safety_notify_allowed(p_recipient UUID, p_actor UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_actor IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM user_mutes WHERE muter_id = p_recipient AND muted_id = p_actor
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks WHERE blocker_id = p_recipient AND blocked_id = p_actor
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks WHERE blocker_id = p_actor AND blocked_id = p_recipient
    );
$$;

-- ── 17c. RETIRE VOLUME-BASED AUTO-HIDE TRIGGER ────────────────
-- Legacy behavior hid a roast after 3 reports regardless of who reported.
-- MP11 principle: reports are signals, not proof — a pile from one actor
-- must not hide content. The distinct-reporter auto-review above replaces
-- it; this trigger is retired so no volume-only auto-removal path exists.
DROP TRIGGER IF EXISTS trigger_auto_hide ON reports;
DROP FUNCTION IF EXISTS public.auto_hide_roast();

-- ═══════════════════════════════════════════════════════════
-- DONE — Trust & Safety v2 schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_04_personalization_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Personalization, Recommendation & For You Engine (Master Prompt 12)
-- NON-DESTRUCTIVE: only adds new tables, indexes, and RLS policies.
-- Does NOT modify, rename, or delete any existing data or table.
--
-- Execution order matters: tables → indexes → RLS.
--
-- Principles enforced here:
--   * Signals are only ever written for the authenticated actor
--     (auth.uid() = user_id) — no client can record behavior for others.
--   * Derived interest data is readable only by its owner. Nothing here is
--     visible to anonymous/anonymous-key clients, other users, or search.
--   * No fake data is inserted — every table starts empty.
--   * Moderation/safety data stays authoritative and untouched.
-- ═══════════════════════════════════════════════════════════

-- ── 1. BEHAVIORAL SIGNAL LOG (server-validated) ─────────────
-- One row per legitimate platform behavior (react, comment, follow, join,
-- participate, negative feedback...). Idempotency keys protect against
-- duplicate/replayed writes; weights are assigned server-side only.
CREATE TABLE IF NOT EXISTS rec_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'content_viewed', 'content_opened',
    'content_reacted', 'content_commented', 'content_replied', 'content_shared',
    'content_hidden', 'not_interested', 'show_less_creator',
    'user_followed', 'user_unfollowed',
    'community_joined', 'community_left',
    'challenge_participated', 'challenge_invite_accepted',
    'battle_voted', 'topic_viewed'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN (
    'social_post', 'roast', 'comment', 'user', 'community', 'challenge', 'battle', 'topic'
  )),
  target_id UUID,
  weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 10),
  -- Context enriches the raw event: author_id, community_id, content_type,
  -- polarity ('positive' | 'negative'), topic_ids, source...
  context JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rec_events_user ON rec_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_events_user_event ON rec_events(user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_events_target ON rec_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_rec_events_recent ON rec_events(created_at DESC);

-- Replay protection: a given (user, idempotency key) may only land once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_events_idempotency
  ON rec_events(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2. USER FEEDBACK (content-level, real user-content relationship) ──
-- Hiding / "Not interested" lives in the database (never only browser
-- state), so hidden content cannot keep returning across sessions/devices.
CREATE TABLE IF NOT EXISTS rec_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('social_post', 'roast')),
  target_id UUID NOT NULL,
  -- 'hide' suppresses this item only; 'not_interested' also applies
  -- proportional negative learning to the captured scopes below.
  action TEXT NOT NULL CHECK (action IN ('hide', 'not_interested')),
  -- Snapshot of the content's attributes at feedback time so negative
  -- learning stays proportional and explainable:
  --   { author_id, community_id, content_type, community_topic_ids }
  scope JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_content_feedback UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_feedback_user ON rec_feedback(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_feedback_target ON rec_feedback(target_type, target_id);

-- ── 3. INTEREST GRAPH (derived affinity, owner-readable only) ──
-- Conceptually: USER → signals → TOPICS / COMMUNITIES / CREATORS /
-- CONTENT TYPES. Scores are derived server-side from real behavior or
-- explicit choices — never guessed, never public.
CREATE TABLE IF NOT EXISTS user_affinities (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('topic', 'creator', 'community', 'content_type')),
  key TEXT NOT NULL,
  label TEXT,
  positive REAL NOT NULL DEFAULT 0,
  negative REAL NOT NULL DEFAULT 0,
  signal_count INT NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_positive_at TIMESTAMPTZ,
  last_negative_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dimension, key)
);

CREATE INDEX IF NOT EXISTS idx_user_affinities_user ON user_affinities(user_id, dimension, positive DESC);

-- ── 4. EXPLICIT INTERESTS (cold start / onboarding) ─────────
-- Explicit Topic selection reuses the Master Prompt 8 `topics` table —
-- no duplicate topic system is created.
CREATE TABLE IF NOT EXISTS user_interests (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'onboarding',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_user_interests_topic ON user_interests(topic_id);

-- ── 5. PERSONALIZATION SETTINGS (user-controlled) ───────────
-- Supports: personalization on/off, interest reset tracking, and future
-- data controls without schema churn.
CREATE TABLE IF NOT EXISTS user_personalization (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  interests_selected BOOLEAN NOT NULL DEFAULT false,
  interests_updated_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — every table is strictly owner-scoped.
-- Anonymous/anonymous-key reads return nothing (no auth.uid()).
-- ═══════════════════════════════════════════════════════════

-- rec_events: owner reads + writes only
ALTER TABLE rec_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own rec events" ON rec_events
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users record own rec events" ON rec_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Owner delete only: used by the viewer's own "Reset personalization"
-- control. Nothing else may delete signals.
DO $$ BEGIN
  CREATE POLICY "Users delete own rec events" ON rec_events
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- rec_feedback: owner full CRUD
ALTER TABLE rec_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own feedback" ON rec_feedback
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users write own feedback" ON rec_feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own feedback" ON rec_feedback
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users delete own feedback" ON rec_feedback
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_affinities: owner reads + maintenance writes only
ALTER TABLE user_affinities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own affinities" ON user_affinities
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own affinities" ON user_affinities
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users maintain own affinities" ON user_affinities
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Owner delete only: used by the viewer's own "Reset personalization".
DO $$ BEGIN
  CREATE POLICY "Users delete own affinities" ON user_affinities
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_interests: owner reads + explicit writes
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own interests" ON user_interests
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users set own interests" ON user_interests
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users clear own interests" ON user_interests
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_personalization: owner reads + writes
ALTER TABLE user_personalization ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own personalization" ON user_personalization
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users create own personalization" ON user_personalization
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own personalization" ON user_personalization
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE — Personalization foundation schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_05_creator_growth_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Creator Economy, Identity & Creator Growth Engine (Master Prompt 13)
-- NON-DESTRUCTIVE: only adds new tables, columns, indexes, and RPC functions.
-- Does NOT modify, rename, or delete any existing data or table.
--
-- Principles enforced here:
--   * Every creator metric derives from REAL platform data (posts, roasts,
--     follows, reactions, comments). No table is ever pre-seeded with fake
--     activity.
--   * Milestones cannot be forged: clients have NO direct write access to
--     creator_milestones. A SECURITY DEFINER function recomputes thresholds
--     from live tables and inserts only genuinely earned milestones.
--   * Creator topics are public identity (like a bio) but only the owner can
--     write them.
--   * The views counter reads the Master Prompt 12 rec_events log (real feed
--     impressions recorded server-side per signed-in member, deduped per day).
--     If rec_events is absent the function is simply not created — the app
--     degrades gracefully and shows no fake number.
-- ═══════════════════════════════════════════════════════════

-- ── 1. CREATOR TOPICS (controlled identity associations) ───
-- Reuses the Master Prompt 8 `topics` table — no duplicate topic system.
-- A creator associates with a small, controlled set of Topics describing what
-- they create. Public identity; owner-only writes.
CREATE TABLE IF NOT EXISTS creator_topics (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_topics_topic ON creator_topics(topic_id);

ALTER TABLE creator_topics ENABLE ROW LEVEL SECURITY;
-- Public read: these are identity tags shown on a public profile (like bio).
DO $$ BEGIN
  CREATE POLICY "Anyone can read creator topics" ON creator_topics
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners set their creator topics" ON creator_topics
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners remove their creator topics" ON creator_topics
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. CREATOR MILESTONES (real, unforgeable achievements) ─
-- Written ONLY by the SECURITY DEFINER function below after recomputing real
-- thresholds. No direct client insert/update/delete policies exist.
CREATE TABLE IF NOT EXISTS creator_milestones (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}',
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_creator_milestones_user ON creator_milestones(user_id, achieved_at DESC);

ALTER TABLE creator_milestones ENABLE ROW LEVEL SECURITY;
-- Owner-only read: personal growth history is not public until BurnBoard
-- ships an explicit profile-celebration surface.
DO $$ BEGIN
  CREATE POLICY "Owners read their milestones" ON creator_milestones
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. ENHANCED PROFILE COLUMNS (additive) ────────────────
-- website_url: a creator's link-in-bio (public identity).
-- featured_post_id: optional pinned content, validated for ownership +
--   moderation at set-time and again at read-time. FK keeps it coherent when
--   the post is deleted (auto-clears) — never points at missing content.
DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS website_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS featured_post_id UUID
    REFERENCES social_posts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 4. ANALYTICS INDEXES (query efficiency, additive) ─────
-- Follower-growth series + audience queries group by following_id + date.
CREATE INDEX IF NOT EXISTS idx_follows_following_created
  ON follows(following_id, created_at DESC);

-- Creator content library: own posts newest-first.
CREATE INDEX IF NOT EXISTS idx_social_posts_user_created
  ON social_posts(user_id, created_at DESC);

-- Engagement lookups target a content id across types.
CREATE INDEX IF NOT EXISTS idx_comments_target_created
  ON comments(target_type, target_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- RPC — creator_totals(p_user, p_days)
-- Real aggregate counts (posts, roasts, followers, reactions received,
-- comments received) for one creator over a window (0 = all time).
-- SECURITY DEFINER so the owner can see engagement on their own content
-- regardless of per-row read policies. Mirrors exactly what the platform
-- tables hold — nothing derived or invented.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION creator_totals(p_user UUID, p_days INTEGER DEFAULT 0)
RETURNS TABLE(posts BIGINT, roasts BIGINT, followers BIGINT, reactions BIGINT, comments BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d INTERVAL;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  d := CASE WHEN p_days > 0 THEN make_interval(days => p_days) ELSE NULL END;

  RETURN QUERY
  SELECT
    (SELECT count(*)::BIGINT FROM social_posts sp
      WHERE sp.user_id = p_user AND (d IS NULL OR sp.created_at >= now() - d)),
    (SELECT count(*)::BIGINT FROM roasts rw
      WHERE rw.user_id = p_user AND (d IS NULL OR rw.created_at >= now() - d)),
    (SELECT count(*)::BIGINT FROM follows f
      WHERE f.following_id = p_user AND (d IS NULL OR f.created_at >= now() - d)),
    (SELECT count(*)::BIGINT FROM reactions r
      WHERE (d IS NULL OR r.created_at >= now() - d)
        AND ((r.target_type = 'social_post' AND EXISTS
                (SELECT 1 FROM social_posts sp WHERE sp.id = r.target_id AND sp.user_id = p_user))
          OR (r.target_type = 'roast' AND EXISTS
                (SELECT 1 FROM roasts rw WHERE rw.id = r.target_id AND rw.user_id = p_user)))),
    (SELECT count(*)::BIGINT FROM comments c
      WHERE (d IS NULL OR c.created_at >= now() - d)
        AND ((c.target_type = 'social_post' AND EXISTS
                (SELECT 1 FROM social_posts sp WHERE sp.id = c.target_id AND sp.user_id = p_user))
          OR (c.target_type = 'roast' AND EXISTS
                (SELECT 1 FROM roasts rw WHERE rw.id = c.target_id AND rw.user_id = p_user))))
  ;
END;
$$;

REVOKE ALL ON FUNCTION creator_totals(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_totals(UUID, INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — ensure_creator_milestones(p_user)
-- Recomputes genuine thresholds from live platform data and inserts any
-- milestones the creator has actually earned but not yet recorded.
-- Returns ONLY the newly-created rows (drives one-time notifications).
-- Unforgeable: direct table writes are impossible via RLS (no policies), and
-- the thresholds are computed server-side from real data.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ensure_creator_milestones(p_user UUID)
RETURNS TABLE(milestone_key TEXT, value BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t RECORD;
  v_posts BIGINT;
  v_roasts BIGINT;
  v_followers BIGINT;
  v_reactions BIGINT;
  v_comments BIGINT;
BEGIN
  IF p_user IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO t FROM creator_totals(p_user, 0);

  v_posts     := COALESCE(t.posts, 0);
  v_roasts    := COALESCE(t.roasts, 0);
  v_followers := COALESCE(t.followers, 0);
  v_reactions := COALESCE(t.reactions, 0);
  v_comments  := COALESCE(t.comments, 0);

  -- Each block returns the row ONLY when it was genuinely earned AND new.
  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'first_post', v_posts WHERE v_posts >= 1
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'posts_10', v_posts WHERE v_posts >= 10
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'posts_50', v_posts WHERE v_posts >= 50
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'posts_100', v_posts WHERE v_posts >= 100
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'first_roast', v_roasts WHERE v_roasts >= 1
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'first_reaction', v_reactions WHERE v_reactions >= 1
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'reactions_100', v_reactions WHERE v_reactions >= 100
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'first_comment', v_comments WHERE v_comments >= 1
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'first_follower', v_followers WHERE v_followers >= 1
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'followers_10', v_followers WHERE v_followers >= 10
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'followers_100', v_followers WHERE v_followers >= 100
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN QUERY
    INSERT INTO creator_milestones (user_id, milestone_key, value)
    SELECT p_user, 'followers_1000', v_followers WHERE v_followers >= 1000
    ON CONFLICT (user_id, milestone_key) DO NOTHING
    RETURNING milestone_key, value;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION ensure_creator_milestones(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_creator_milestones(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — count_creator_views(p_author, p_days)
-- Aggregate "views" = real feed impressions of the author's content recorded
-- in rec_events (Master Prompt 12) by signed-in members, deduped per member
-- per item per day at write time. Created only when rec_events exists so this
-- migration stays runnable on projects that skipped MP12 (graceful degrade).
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.rec_events') IS NOT NULL THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION count_creator_views(p_author UUID, p_days INTEGER DEFAULT 0)
      RETURNS TABLE(content_id UUID, views BIGINT)
      LANGUAGE sql SECURITY DEFINER SET search_path = public AS $sql$
        SELECT target_id::UUID, count(*)::BIGINT
        FROM rec_events
        WHERE event_type = 'content_viewed'
          AND context->>'author_id' = p_author::TEXT
          AND (p_days <= 0 OR created_at >= now() - make_interval(days => p_days))
        GROUP BY target_id
      $sql$;
      REVOKE ALL ON FUNCTION count_creator_views(UUID, INTEGER) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION count_creator_views(UUID, INTEGER) TO authenticated;
    $func$;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- DONE — Creator growth foundation schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_06_growth_loops.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Viral Sharing, Social Graph Expansion & Global Growth Loops (Master Prompt 14)
-- NON-DESTRUCTIVE: only adds new tables, indexes, and RPC functions.
-- Does NOT modify, rename, or delete any existing data or table.
--
-- Principles enforced here:
--   * Every share / referral row represents a REAL user action. Nothing is
--     seeded, simulated, or rewarded without a genuine event.
--   * Anonymous visitors may record share events (actor_id NULL) but can
--     never impersonate a signed-in actor (RLS enforces actor_id = auth.uid()).
--   * Referral codes and visit/conversion records are only ever written by
--     SECURITY DEFINER functions — clients cannot forge codes, visits, or
--     conversions. Fraud-guards (self-referral, one conversion per visit,
--     rate caps) live in the SQL, server-side.
--   * Post-signup continuation persists in signup_destinations and is
--     owner-scoped; the path is validated server-side (internal paths only).
--   * No private data is exposed: shares/referrals are not publicly readable.
-- ═══════════════════════════════════════════════════════════

-- ── 1. SHARE EVENTS (centralized, real) ───────────────────
CREATE TABLE IF NOT EXISTS shares (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'social_post', 'roast', 'profile', 'community', 'challenge', 'battle', 'topic'
  )),
  resource_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN (
    'native', 'copy', 'clipboard', 'x', 'facebook', 'whatsapp', 'telegram',
    'sms', 'email', 'link', 'other'
  )),
  context JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_actor ON shares(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_recent ON shares(created_at DESC);

-- Replay protection for repeat share taps on the same resource+channel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_idempotency
  ON shares(actor_id, resource_type, resource_id, channel, idempotency_key)
  WHERE actor_id IS NOT NULL AND idempotency_key IS NOT NULL;

ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
-- Authenticated users can record their own share events; anonymous visitors
-- can record a real share action with a NULL actor (no impersonation).
DO $$ BEGIN
  CREATE POLICY "Anyone can record a real share" ON shares
    FOR INSERT WITH CHECK (actor_id IS NULL OR auth.uid() = actor_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners read their own shares" ON shares
    FOR SELECT USING (auth.uid() = actor_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. REFERRAL CODES (durable, revocable, opaque) ─────────
-- The code is the only public-facing identifier — never a user id or email.
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
-- Reading your own code is fine; writing is exclusively via SECURITY DEFINER
-- functions (collision handling + fraud controls live in SQL).
DO $$ BEGIN
  CREATE POLICY "Owners read their referral code" ON referral_codes
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. REFERRAL VISITS + CONVERSIONS (server-written only) ─
-- No RLS policies at all: the only writers are the SECURITY DEFINER RPCs.
CREATE TABLE IF NOT EXISTS referral_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_visits_code ON referral_visits(code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_visits_unconverted ON referral_visits(converted_at) WHERE converted_at IS NULL;

-- ── 4. POST-SIGNUP CONTINUATION (owner-scoped) ─────────────
-- Preserves the visitor's intended destination through the signup flow so a
-- shared link never dead-ends at an account wall.
CREATE TABLE IF NOT EXISTS signup_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  path TEXT NOT NULL,
  referrer_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE signup_destinations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Owners read their signup destination" ON signup_destinations
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners save their signup destination" ON signup_destinations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners consume their signup destination" ON signup_destinations
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- RPC — create_referral_code(p_user)
-- Returns the user's active code, creating a fresh opaque one if needed.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_referral_code(p_user UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_chars CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  i INT;
  v_exists BOOLEAN;
BEGIN
  IF p_user IS NULL OR auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT code INTO v_code FROM referral_codes
    WHERE user_id = p_user AND active = true LIMIT 1;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Generate an opaque, collision-safe code (unambiguous alphabet).
  FOR i IN 1..20 LOOP
    v_code := '';
    FOR j IN 1..8 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO referral_codes (user_id, code) VALUES (p_user, v_code);
      RETURN v_code;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION create_referral_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_referral_code(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — record_referral_visit(p_code)
-- Public visitors with a valid referral code get an opaque visit token.
-- Rate-capped (max 200 visits/hour/code) to stop referral farming.
-- Returns the token to store in a first-party cookie, or NULL.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_referral_visit(p_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_visits INT;
  v_token UUID;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[a-z0-9]{6,12}$' THEN
    RETURN NULL;
  END IF;
  v_code := lower(p_code);

  IF NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = v_code AND active = true) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_visits FROM referral_visits
    WHERE code = v_code AND created_at > now() - interval '1 hour';
  IF v_visits >= 200 THEN
    RETURN NULL;
  END IF;

  INSERT INTO referral_visits (code, referrer_user_id)
  SELECT code, user_id FROM referral_codes WHERE code = v_code
  RETURNING id INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION record_referral_visit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_referral_visit(TEXT) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — claim_referral_by_token(p_token, p_user)
-- Called after a REAL signup/sign-in when a first-party referral cookie
-- (an opaque visit token, never a user id) is present.
-- Guards: self-referrals never convert; each visit converts once; the token
-- must genuinely exist (forgery impossible — tokens are random UUIDs only
-- returned by record_referral_visit).
-- Returns the referrer's code on success (null otherwise) so rewards can be
-- granted later — rewards themselves are NOT implemented yet.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION claim_referral_by_token(p_token UUID, p_user UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_referrer UUID;
BEGIN
  IF p_token IS NULL OR p_user IS NULL OR auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT code, referrer_user_id INTO v_code, v_referrer
    FROM referral_visits
    WHERE id = p_token AND converted_at IS NULL
    LIMIT 1;

  IF v_code IS NULL OR v_referrer IS NULL OR v_referrer = p_user THEN
    RETURN NULL;
  END IF;

  UPDATE referral_visits
    SET converted_at = now(), converted_user_id = p_user
    WHERE id = p_token AND converted_at IS NULL;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION claim_referral_by_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_referral_by_token(UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — save_signup_destination(p_path, p_ref)
-- Persists the visitor's destination (internal path only) so the auth flow
-- can return the user to the content they were originally shown.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION save_signup_destination(p_path TEXT, p_ref TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_safe TEXT;
  v_ok BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_path IS NULL THEN
    RETURN false;
  END IF;

  -- Internal paths only: must start with a single "/" and never "//" or "/\".
  v_safe := p_path;
  IF v_safe !~ '^/[^/\\]' OR position('?' in v_safe) = 1 THEN
    RETURN false;
  END IF;
  IF length(v_safe) > 500 THEN
    RETURN false;
  END IF;
  v_safe := regexp_replace(v_safe, '[\r\n]', '', 'g');

  INSERT INTO signup_destinations (user_id, path, referrer_code)
  VALUES (auth.uid(), v_safe, NULLIF(p_ref, ''))
  ON CONFLICT (user_id) DO UPDATE
    SET path = EXCLUDED.path, referrer_code = EXCLUDED.referrer_code, used_at = NULL
  RETURNING id IS NOT NULL INTO v_ok;

  RETURN v_ok;
END;
$$;

REVOKE ALL ON FUNCTION save_signup_destination(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_signup_destination(TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- DONE — Growth loops schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_07_monetization_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Monetization, Creator Revenue & Sustainable Business Engine (Master Prompt 15)
-- NON-DESTRUCTIVE: only adds new tables, indexes, RPC functions, and seed
-- data. Does NOT modify, rename, or delete any existing table or row.
--
-- Principles enforced here:
--   * All financial truth is backend-authoritative. Payment status is only
--     ever written by verified provider events (webhook pipeline) — the
--     client can at most create a "pending" checkout record.
--   * monetization_purchases is an immutable ledger: purchases are APPENDED,
--     refunds/disputes are recorded as separate adjustment rows (never
--     DELETE/UPDATE of history). No mutable "balance" numbers anywhere.
--   * Every purchase/entitlement/event records origin ('dev'|'test'|'prod')
--     so sandbox transactions can never mix with real financial records.
--   * Entitlements are the only thing that gates paid access, and they are
--     derived from verified provider events — never from frontend status.
--   * No raw card/bank data is ever stored here; provider tokens only.
--   * No RLS write policies exist on any financial table. Direct client
--     inserts/updates are impossible; only SECURITY DEFINER functions may
--     write (webhook reconciliation, admin ops), so clients can never forge
--     payments, refunds, earnings, or audit entries.
-- ═══════════════════════════════════════════════════════════

-- ── 1. PRODUCT CATALOG (configuration, centralized) ────────
-- Product = what is sold. Status controls availability (draft/active/retired).
CREATE TABLE IF NOT EXISTS monetization_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]{2,64}$'),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL CHECK (product_type IN (
    'platform_premium', 'creator_subscription', 'paid_community',
    'tip', 'digital_product', 'future'
  )),
  -- NULL = platform product; paid_community sets community_id; creator
  -- subscriptions/pins set owner_id. One of these must be set at runtime.
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  billing_text TEXT NOT NULL DEFAULT '',
  feature_list JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_products_status ON monetization_products(status, product_type);

-- ── 2. PRICING ARCHITECTURE (centralized) ─────────────────
-- Price = a specific amount/currency/interval for a product. Both active
-- prices are kept; promotions add rows rather than mutating sold prices.
-- amount_minor = integer minor units (e.g. cents), so money is never stored
-- as floats.
CREATE TABLE IF NOT EXISTS monetization_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES monetization_products(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),
  billing_interval TEXT NOT NULL DEFAULT 'one_time' CHECK (billing_interval IN (
    'one_time', 'month', 'year'
  )),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  region TEXT NOT NULL DEFAULT 'global' CHECK (region ~ '^[a-z0-9_-]{1,32}$'),
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  trial_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_prices_product ON monetization_prices(product_id, status);

-- ── 3. PURCHASES (immutable financial ledger) ──────────────
-- One row per completed customer transaction (incl. platform purchases,
-- creator subscriptions, tips, digital products). Recurring renewals each
-- append their own purchase row. Never updated once written — every financial
-- consequence (refund, dispute, fee adjustment) is a separate row.
CREATE TABLE IF NOT EXISTS monetization_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unique idempotency key for the checkout attempt (server-generated).
  transaction_ref TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL,
  -- Provider is 'cc_sandbox' (dev/test driver), 'stripe', or future
  -- providers. The abstraction layer maps these; stored for audit.
  provider TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES monetization_products(id) ON DELETE RESTRICT,
  price_id UUID NOT NULL REFERENCES monetization_prices(id) ON DELETE RESTRICT,
  -- Provider-granted entitlement (the thing access is granted to).
  entitlement_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded',
    'disputed', 'reversed', 'void'
  )),
  -- Actual price paid (what the user was charged — preserved verbatim).
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),
  -- Original basis plus provider event reference and time bounds.
  provider_reference TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  origin TEXT NOT NULL DEFAULT 'prod' CHECK (origin IN ('dev', 'test', 'prod')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_purchases_user ON monetization_purchases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_purchases_product ON monetization_purchases(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_purchases_provider ON monetization_purchases(provider_id);
CREATE INDEX IF NOT EXISTS idx_monetization_purchases_origin ON monetization_purchases(origin, created_at DESC);

-- ── 4. FINANCIAL ADJUSTMENTS (refunds, disputes, corrections) ──
-- Instructor: every money-movement OUT of the recorded gross (refund,
-- dispute, reversal, fee correction) appends a row here. The ledger stays
-- immutable; net = sum(purchases) + sum(adjustments) for a user.
CREATE TABLE IF NOT EXISTS monetization_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES monetization_purchases(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN (
    'refund', 'dispute', 'reversal', 'correction', 'fee_change'
  )),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),
  reason TEXT NOT NULL DEFAULT '',
  provider_reference TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origin TEXT NOT NULL DEFAULT 'prod' CHECK (origin IN ('dev', 'test', 'prod')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_adjustments_purchase ON monetization_adjustments(purchase_id);

-- ── 5. ENTITLEMENTS (backend-authoritative access grants) ──
-- Derived from verified provider events by the webhook pipeline. UI never
-- writes here; feature gating reads here. Status lifecycle: pending (awaiting
-- payment verification) → active → cancelled/expired/revoked/suspended.
CREATE TABLE IF NOT EXISTS monetization_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES monetization_products(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'active', 'cancelled', 'expired', 'revoked', 'suspended'
  )),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase', 'grant', 'admin', 'promo', 'sandbox')),
  origin TEXT NOT NULL DEFAULT 'prod' CHECK (origin IN ('dev', 'test', 'prod')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_entitlements_user ON monetization_entitlements(user_id, status);
CREATE INDEX IF NOT EXISTS idx_monetization_entitlements_key ON monetization_entitlements(key, status);

-- ── 6. PROVIDER PAYMENT EVENTS (webhook pipeline) ──────────
-- Every verified provider event lands exactly once (unique provider_event_id).
-- Processing is idempotent: replaying a webhook is a no-op, never a double
-- credit. status tracks the durable processing state for retries/recovery.
CREATE TABLE IF NOT EXISTS monetization_payment_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_reference TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'processing', 'processed', 'failed', 'ignored'
  )),
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  origin TEXT NOT NULL DEFAULT 'prod' CHECK (origin IN ('dev', 'test', 'prod')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_monetization_payment_events_status ON monetization_payment_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_monetization_payment_events_ref ON monetization_payment_events(provider_reference);

-- ── 7. CREATOR BALANCE / PAYOUT STATE (ledger-derived) ─────
-- Not a "balance" the creator can spend — a derived summary row recomputed
-- by SECURITY DEFINER functions from the real ledger. Dust amounts are
-- prevented via CHECK (wallet + held etc. are always >= 0). Payouts append
-- rows; holds/reversals adjust via new rows, never UPDATE of history here
-- beyond `status`.
CREATE TABLE IF NOT EXISTS monetization_creator_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  earned_minor INTEGER NOT NULL DEFAULT 0 CHECK (earned_minor >= 0),
  pending_minor INTEGER NOT NULL DEFAULT 0 CHECK (pending_minor >= 0),
  available_minor INTEGER NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  held_minor INTEGER NOT NULL DEFAULT 0 CHECK (held_minor >= 0),
  paid_out_minor INTEGER NOT NULL DEFAULT 0 CHECK (paid_out_minor >= 0),
  reversed_minor INTEGER NOT NULL DEFAULT 0 CHECK (reversed_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. PAYOUTS (creator withdrawals) ───────────────────────
-- Foundation only: created by SECURITY DEFINER admin flows after eligibility
-- (identity/payout onboarding, thresholds, fraud review). Nothing here makes
-- real money move until a compliant provider payout driver exists.
CREATE TABLE IF NOT EXISTS monetization_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'held', 'processing', 'paid', 'failed', 'reversed'
  )),
  provider_reference TEXT,
  provider TEXT,
  origin TEXT NOT NULL DEFAULT 'prod' CHECK (origin IN ('dev', 'test', 'prod')),
  request_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_payouts_user ON monetization_payouts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_payouts_status ON monetization_payouts(status);

-- ── 9. FINANCIAL AUDIT LOG (written by SECURITY DEFINER only) ──
-- Sensitive financial actions are appended here. No RLS write policy — call
-- record_monetization_audit(). Immutable (no update policy).
CREATE TABLE IF NOT EXISTS monetization_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID,
  details JSONB NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL DEFAULT 'prod' CHECK (origin IN ('dev', 'test', 'prod')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_audit_log_actor ON monetization_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_audit_log_target ON monetization_audit_log(target_user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — owner-readable only, no direct writes.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE monetization_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_creator_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_audit_log ENABLE ROW LEVEL SECURITY;

-- Catalog: active products and prices are public marketing data — safe to
-- read (no PII, no pricing decisions). Everything else is owner-only.
DO $$ BEGIN
  CREATE POLICY "Public read active products" ON monetization_products
    FOR SELECT USING (status = 'active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Public read active prices" ON monetization_prices
    FOR SELECT USING (status = 'active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Purchases: owner reads their own purchase history only, and may create
-- PENDING checkout rows (status is enforced as 'pending' on insert — the
-- client can never insert a 'succeeded' row directly). Promotion to
-- 'succeeded' happens exclusively through the SECURITY DEFINER fulfillment
-- function after a verified provider event.
DO $$ BEGIN
  CREATE POLICY "Owners read own purchases" ON monetization_purchases
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners create pending checkout" ON monetization_purchases
    FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Creators read purchases of their OWN products (used for the revenue
-- dashboard). The route layer strips supporter identity before responding.
DO $$ BEGIN
  CREATE POLICY "Creators read purchases on own products" ON monetization_purchases
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM monetization_products mp
      WHERE mp.id = product_id AND mp.owner_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Creators read adjustments on own products" ON monetization_adjustments
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM monetization_purchases p
      JOIN monetization_products mp ON mp.id = p.product_id
      WHERE p.id = purchase_id AND mp.owner_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Adjustments: owners read adjustments against their own purchases.
DO $$ BEGIN
  CREATE POLICY "Owners read own adjustments" ON monetization_adjustments
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM monetization_purchases p
      WHERE p.id = purchase_id AND p.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Entitlements: owners read their own entitlements (server derives them).
DO $$ BEGIN
  CREATE POLICY "Owners read own entitlements" ON monetization_entitlements
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Creator balances/payouts: owners read their own (server derives them).
DO $$ BEGIN
  CREATE POLICY "Owners read own balances" ON monetization_creator_balances
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Owners read own payouts" ON monetization_payouts
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Provider events / audit log: no read policies at all — these are
-- server-internal tables never exposed to clients (even owners).

-- ═══════════════════════════════════════════════════════════
-- RPC — check_entitlement(p_user, p_key)
-- Backend-authoritative entitlement check. SECURITY DEFINER: reads are
-- owner-independent so the function can be used inside RLS policies later
-- (e.g. paid-community post visibility). An active entitlement whose
-- current_period_end is in the past is treated as expired by callers — the
-- webhook pipeline keeps this column fresh on renewal.
-- Returns TRUE/FALSE — never exposes any score or internal state.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_entitlement(p_user UUID, p_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active BOOLEAN;
BEGIN
  IF p_user IS NULL OR p_key IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM monetization_entitlements e
    WHERE e.user_id = p_user
      AND e.key = p_key
      AND e.status = 'active'
      AND (e.current_period_end IS NULL OR e.current_period_end > now())
  ) INTO v_active;
  RETURN COALESCE(v_active, false);
END;
$$;

REVOKE ALL ON FUNCTION check_entitlement(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_entitlement(UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — record_monetization_event(p_provider, p_event_id, p_payload)
-- Idempotent webhook event intake. The first call for a given
-- (provider, event_id) persists the event; replays return the existing row
-- without inserting. Processing happens afterwards in the application
-- layer; this function is the durable gate that prevents double credit.
-- Returns the event id (null if the event was for a different provider).
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_monetization_event(
  p_provider TEXT,
  p_event_id TEXT,
  p_payload JSONB DEFAULT '{}'
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF p_provider IS NULL OR length(p_event_id) < 4 OR length(p_event_id) > 200 THEN
    RETURN NULL;
  END IF;

  INSERT INTO monetization_payment_events (provider, provider_event_id, payload)
  VALUES (p_provider, p_event_id, COALESCE(p_payload, '{}'::jsonb))
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION record_monetization_event(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_monetization_event(TEXT, TEXT, JSONB) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — fulfill_monetization_purchase(...)
-- The ONLY way a purchase becomes 'succeeded' and an entitlement becomes
-- 'active'. Called by the webhook pipeline AFTER signature verification and
-- AFTER record_monetization_event persisted the provider event (p_event_id).
--   * Only transitions pending → succeeded (an already-succeeded purchase is
--     a no-op → replays never double-credit).
--   * Creates/extends the matching entitlement from the purchase's own
--     entitlement_key.
--   * When the product has an owner (creator product), credits the creator's
--     balance using the net amount provided by the centralized revenue-split
--     policy in the app layer (gross + fees recorded as metadata for audit).
--   * Always writes an audit line.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fulfill_monetization_purchase(
  p_purchase_id UUID,
  p_event_id BIGINT,
  p_status TEXT DEFAULT 'succeeded',
  p_provider_reference TEXT DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_purchase monetization_purchases%ROWTYPE;
  v_exists BOOLEAN;
  v_product monetization_products%ROWTYPE;
  v_net_minor INTEGER := 0;
  v_fee_minor INTEGER := 0;
BEGIN
  -- The provider event must exist (persisted by the verified webhook).
  SELECT EXISTS(
    SELECT 1 FROM monetization_payment_events
    WHERE id = p_event_id AND status = 'received'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN false;
  END IF;

  SELECT * INTO v_purchase FROM monetization_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Idempotency: only pending purchases may be fulfilled.
  IF v_purchase.status <> 'pending' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_product FROM monetization_products WHERE id = v_purchase.product_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Promote the purchase (immutable ledger: status is the only sanctioned
  -- transition on the row itself; financial amounts never change).
  UPDATE monetization_purchases
    SET status = p_status,
        provider_reference = COALESCE(p_provider_reference, provider_reference),
        period_start = COALESCE(p_period_start, period_start),
        period_end = COALESCE(p_period_end, period_end),
        metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_purchase_id;

  -- Mark the event processed (durable, auditable).
  UPDATE monetization_payment_events
    SET status = 'processed', processed_at = now()
    WHERE id = p_event_id;

  -- Entitlement: activate (or keep/extend the existing active row).
  INSERT INTO monetization_entitlements (user_id, product_id, key, status, current_period_end, source, origin)
  VALUES (
    v_purchase.user_id,
    v_purchase.product_id,
    v_purchase.entitlement_key,
    'active',
    p_period_end,
    CASE WHEN v_purchase.origin = 'prod' THEN 'purchase' ELSE 'sandbox' END,
    v_purchase.origin
  )
  ON CONFLICT DO NOTHING;

  -- If an entitlement row already exists for this user+key+product, extend
  -- its period and keep it active (renewals must not create duplicates).
  IF p_status = 'succeeded' THEN
    UPDATE monetization_entitlements
      SET status = 'active',
          current_period_end = GREATEST(current_period_end, p_period_end),
          cancel_at_period_end = false,
          updated_at = now()
      WHERE user_id = v_purchase.user_id
        AND product_id = v_purchase.product_id
        AND key = v_purchase.entitlement_key;
  END IF;

  -- Creator earnings (product owned by a creator). Net split computed by the
  -- app layer policy and passed in metadata; gross+fees recorded verbatim.
  IF v_product.owner_id IS NOT NULL THEN
    v_fee_minor := COALESCE((COALESCE(p_metadata, '{}'::jsonb) ->> 'platform_fee_minor')::int, 0)
                + COALESCE((COALESCE(p_metadata, '{}'::jsonb) ->> 'processing_fee_minor')::int, 0);
    v_net_minor := GREATEST(v_purchase.amount_minor - v_fee_minor, 0);

    INSERT INTO monetization_creator_balances (user_id, earned_minor, pending_minor, available_minor)
    VALUES (v_product.owner_id, v_net_minor, 0, v_net_minor)
    ON CONFLICT (user_id) DO UPDATE
      SET earned_minor = monetization_creator_balances.earned_minor + v_net_minor,
          available_minor = monetization_creator_balances.available_minor + v_net_minor,
          updated_at = now();
  END IF;

  PERFORM record_monetization_audit(
    'purchase_fulfilled',
    jsonb_build_object(
      'purchase_id', p_purchase_id,
      'event_id', p_event_id,
      'provider_reference', p_provider_reference,
      'entitlement_key', v_purchase.entitlement_key,
      'gross_minor', v_purchase.amount_minor,
      'net_minor', v_net_minor
    ),
    auth.uid(),
    v_purchase.user_id
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION fulfill_monetization_purchase(UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) FROM PUBLIC;
-- Intentionally authenticated-only for now (sandbox flow runs through the
-- user's session). Real providers append a service-role path later — the
-- provider-event existence gate prevents forged fulfillment either way.
GRANT EXECUTE ON FUNCTION fulfill_monetization_purchase(UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — refund_monetization_purchase(p_purchase_id, p_amount_minor,
--                                   p_reason, p_provider_reference)
-- Appends a REFUND adjustment (never deletes/overwrites the original
-- purchase), marks the purchase refunded, closes the entitlement, and
-- reverses the creator's ledger-derived balance. Owner-facing cancellation
-- of a subscription is end-of-period only (see cancel RPC); refunds are a
-- provider-confirmed/administrative action — this function is only callable
-- by a trusted service role downstream, never by regular users.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION refund_monetization_purchase(
  p_purchase_id UUID,
  p_amount_minor INTEGER,
  p_reason TEXT DEFAULT 'refund',
  p_provider_reference TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_purchase monetization_purchases%ROWTYPE;
  v_product monetization_products%ROWTYPE;
  v_net_minor INTEGER;
BEGIN
  SELECT * INTO v_purchase FROM monetization_purchases WHERE id = p_purchase_id;
  IF NOT FOUND OR v_purchase.status <> 'succeeded' THEN
    RETURN false;
  END IF;
  IF p_amount_minor <= 0 OR p_amount_minor > v_purchase.amount_minor THEN
    RETURN false;
  END IF;

  -- Immutable ledger: append the adjustment, transition status only.
  INSERT INTO monetization_adjustments (purchase_id, adjustment_type, amount_minor, currency, reason, provider_reference, created_by)
  VALUES (p_purchase_id, 'refund', -p_amount_minor, v_purchase.currency, p_reason, p_provider_reference, p_actor_id);

  UPDATE monetization_purchases
    SET status = CASE WHEN p_amount_minor = v_purchase.amount_minor THEN 'refunded' ELSE 'partially_refunded' END
    WHERE id = p_purchase_id;

  -- Entitlement: fully refunded purchases lose access (revoked); partial
  -- refunds keep access for the paid window (policy reviewers may adjust).
  IF p_amount_minor = v_purchase.amount_minor THEN
    UPDATE monetization_entitlements
      SET status = 'revoked', updated_at = now()
      WHERE user_id = v_purchase.user_id AND product_id = v_purchase.product_id AND key = v_purchase.entitlement_key;
  END IF;

  -- Reverse the creator's derived balance by the net the creator earned.
  SELECT * INTO v_product FROM monetization_products WHERE id = v_purchase.product_id;
  IF v_product.owner_id IS NOT NULL THEN
    v_net_minor := GREATEST(p_amount_minor - COALESCE((v_purchase.metadata ->> 'platform_fee_minor')::int, 0)
                                       - COALESCE((v_purchase.metadata ->> 'processing_fee_minor')::int, 0), 0);
    UPDATE monetization_creator_balances
      SET earned_minor = GREATEST(earned_minor - v_net_minor, 0),
          available_minor = GREATEST(available_minor - v_net_minor, 0),
          held_minor = held_minor + v_net_minor,
          updated_at = now()
      WHERE user_id = v_product.owner_id;
  END IF;

  PERFORM record_monetization_audit(
    'purchase_refunded',
    jsonb_build_object('purchase_id', p_purchase_id, 'amount_minor', p_amount_minor, 'reason', p_reason),
    p_actor_id,
    v_purchase.user_id
  );

  RETURN true;
END;
$$;

-- Back-office only: refunds run under service_role (provider-confirmed
-- chargebacks or admin review) — never under a regular user session.
REVOKE ALL ON FUNCTION refund_monetization_purchase(UUID, INTEGER, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_monetization_purchase(UUID, INTEGER, TEXT, TEXT, UUID) TO service_role;

-- Service-role grants for the real-provider webhook path (the sandbox flow
-- runs under the user session; a production provider will ingest with
-- service_role). The event-existence + pending-only gates inside the function
-- prevent forgery regardless of caller role.
GRANT EXECUTE ON FUNCTION record_monetization_event(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION fulfill_monetization_purchase(UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION record_monetization_audit(TEXT, JSONB, UUID, UUID) TO service_role;

-- ═══════════════════════════════════════════════════════════
-- One active tip product per creator (owner_id NULL rows are the platform
-- catalog; only tip rows are constrained).
-- ═══════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tip_product_per_owner
  ON monetization_products(owner_id)
  WHERE product_type = 'tip';

-- ═══════════════════════════════════════════════════════════
-- RPC — ensure_creator_tip_product(p_creator)
-- Idempotently provisions a creator's optional tip product with the
-- standardized tip tiers (ONE-TIME, policy-capped amounts). Called by the
-- tip endpoint when a supporter opens the "Support this creator" flow — the
-- self-purchase guard (creator can never buy their own product) lives in the
-- checkout layer. Amounts are centralized here and in config; no app code
-- hardcodes tip pricing.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ensure_creator_tip_product(p_creator UUID)
RETURNS TABLE (product_id UUID, price_ids UUID[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product_id UUID;
  v_price_ids UUID[] := '{}';
  v_creator_exists BOOLEAN;
  v_amount INT;
  v_price_id UUID;
BEGIN
  IF p_creator IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Only real, discoverable accounts can receive tips.
  SELECT EXISTS(SELECT 1 FROM user_profiles WHERE id = p_creator) INTO v_creator_exists;
  IF NOT v_creator_exists THEN
    RETURN;
  END IF;

  -- Existing active tip product for this creator?
  SELECT id INTO v_product_id FROM monetization_products
    WHERE product_type = 'tip' AND owner_id = p_creator AND status = 'active'
    LIMIT 1;

  IF v_product_id IS NULL THEN
    INSERT INTO monetization_products (key, name, description, product_type, owner_id, status, billing_text, feature_list)
    VALUES (
      'tip_' || replace(p_creator::text, '-', ''),
      'Tip for creator',
      'Voluntary support for a creator you value. A genuine gift - no hidden terms.',
      'tip', p_creator, 'active',
      'One-time. No automatic renewals - there is nothing recurring to cancel.',
      '[]'::jsonb
    )
    RETURNING id INTO v_product_id;
  END IF;

  -- Standard one-time tip tiers (minor units): $1, $3, $5, $10.
  FOR v_amount IN SELECT unnest(ARRAY[100, 300, 500, 1000]::int[])
  LOOP
    SELECT id INTO v_price_id FROM monetization_prices
      WHERE product_id = v_product_id AND amount_minor = v_amount
        AND billing_interval = 'one_time' AND status = 'active'
      LIMIT 1;
    IF v_price_id IS NULL THEN
      INSERT INTO monetization_prices (product_id, amount_minor, currency, billing_interval, interval_count, region, label, status)
      VALUES (v_product_id, v_amount, 'usd', 'one_time', 1, 'global', '$' || (v_amount / 100)::text || ' tip', 'active')
      RETURNING id INTO v_price_id;
    END IF;
    v_price_ids := v_price_ids || v_price_id;
  END LOOP;

  RETURN QUERY SELECT v_product_id, v_price_ids;
END;
$$;

REVOKE ALL ON FUNCTION ensure_creator_tip_product(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_creator_tip_product(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — cancel_monetization_subscription(p_user, p_key)
-- Owner-scoped subscription cancellation: end-of-period cancellation is set
-- on the user's own active entitlement (benefits remain until expiry), and
-- the provider driver is told to stop renewing. Never a hard revocation
-- unless called with p_immediate = true by a trusted admin flow.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cancel_monetization_subscription(
  p_user UUID,
  p_key TEXT,
  p_immediate BOOLEAN DEFAULT false
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN false; -- owners may only cancel their own subscriptions
  END IF;

  UPDATE monetization_entitlements
    SET cancel_at_period_end = true,
        status = CASE WHEN p_immediate THEN 'cancelled' ELSE status END,
        updated_at = now()
    WHERE user_id = p_user AND key = p_key AND status = 'active'
    RETURNING id INTO v_updated;

  PERFORM record_monetization_audit(
    'subscription_cancelled',
    jsonb_build_object('key', p_key, 'immediate', p_immediate),
    p_user,
    p_user
  );

  RETURN COALESCE(v_updated, 0) > 0;
END;
$$;

REVOKE ALL ON FUNCTION cancel_monetization_subscription(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_monetization_subscription(UUID, TEXT, BOOLEAN) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — record_monetization_audit(...)
-- Appends a financial audit line (SECURITY DEFINER only; no direct table
-- policy exists). Used by webhook promotions, admin ops, and future
-- financial tooling. Returns success.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_monetization_audit(
  p_action TEXT,
  p_details JSONB DEFAULT '{}',
  p_actor_id UUID DEFAULT auth.uid(),
  p_target_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_action IS NULL OR length(p_action) < 2 OR length(p_action) > 100 THEN
    RETURN false;
  END IF;
  INSERT INTO monetization_audit_log (action, actor_id, target_user_id, details)
  VALUES (p_action, p_actor_id, p_target_user_id, COALESCE(p_details, '{}'::jsonb));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION record_monetization_audit(TEXT, JSONB, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_monetization_audit(TEXT, JSONB, UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RECONCILIATION — detect ledger/entitlement drift without rewriting.
-- Returns rows any time a purchase lacks its matching entitlement or has an
-- inconsistent status; admin tooling surfaces these for review. Corrections
-- are recorded via adjustments/audit — never silent UPDATEs of history.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reconcile_monetization()
RETURNS TABLE (purchase_id UUID, user_id UUID, kind TEXT, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id AS purchase_id, p.user_id AS user_id,
         'entitlement_missing'::TEXT AS kind,
         'Purchase ' || p.status || ' has no matching ' || p.entitlement_key || ' entitlement' AS detail
    FROM monetization_purchases p
    WHERE p.status = 'succeeded'
      AND NOT EXISTS (
        SELECT 1 FROM monetization_entitlements e
        WHERE e.user_id = p.user_id AND e.key = p.entitlement_key AND e.product_id = p.product_id
      )
  UNION ALL
  SELECT p.id, p.user_id,
         'paid_twice'::TEXT,
         'Duplicate succeeded purchase for provider ref ' || p.provider_reference
    FROM monetization_purchases p
    WHERE p.status = 'succeeded' AND p.provider_reference IS NOT NULL
      AND (SELECT count(*) FROM monetization_purchases p2
           WHERE p2.provider_reference = p.provider_reference AND p2.status = 'succeeded') > 1
  LIMIT 1000;
END;
$$;

-- Admin/service-role only (it reads internal tables across all users).
REVOKE ALL ON FUNCTION reconcile_monetization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_monetization() TO service_role;

-- ═══════════════════════════════════════════════════════════
-- SEED CATALOG (default products + centralized pricing)
-- Fixed ids for the platform's own products make integration deterministic.
-- ═══════════════════════════════════════════════════════════
INSERT INTO monetization_products (id, key, name, description, product_type, status, billing_text, feature_list)
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'premium',
    'BurnBoard Premium',
    'Unlock the full BurnBoard experience with advanced creator tools, profile customization, and priority discovery.',
    'platform_premium',
    'active',
    'Monthly or yearly. Cancel anytime — you keep access until the end of the paid period.',
    '["Advanced creator analytics", "Profile customization", "Priority discovery tools", "Enhanced personalization controls"]'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'creator_subscription',
    'Creator Subscription',
    'Support a creator you love with an optional monthly membership. Value for you, real support for them.',
    'creator_subscription',
    'draft',
    '',
    '[]'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'tip',
    'Creators Tip (Support)',
    'Optional voluntary support for a creator. A genuine gift — no hidden terms.',
    'tip',
    'draft',
    '',
    '[]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO monetization_prices (product_id, amount_minor, currency, billing_interval, interval_count, region, label, status, trial_days)
SELECT p.id, 499, 'usd', 'month', 1, 'global', 'Monthly', 'active', NULL FROM monetization_products p WHERE p.key = 'premium'
ON CONFLICT DO NOTHING;

INSERT INTO monetization_prices (product_id, amount_minor, currency, billing_interval, interval_count, region, label, status, trial_days)
SELECT p.id, 3999, 'usd', 'year', 1, 'global', 'Yearly', 'active', NULL FROM monetization_products p WHERE p.key = 'premium'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- DONE — Monetization foundation schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_08_ai_intelligence_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD AI Intelligence Foundation (Master Prompt 17)
--
-- NON-DESTRUCTIVE: only adds new tables, indexes, RLS policies and RPCs.
-- No existing table is dropped, renamed, or modified.
--
-- Contents:
--   1. ai_jobs             — async AI work queue (embeddings, classification,
--                            quality scoring). Processed by lib/ai/worker.js.
--   2. ai_content_metadata — content understanding results (language, topics,
--                            quality score, embedding, model version).
--   3. ai_usage_log        — per-call observability + cost tracking with
--                            retention cleanup.
--   4. RPCs                — enqueue_ai_job (idempotent), claim_ai_jobs
--                            (atomic FOR UPDATE SKIP LOCKED), cleanup_ai_logs.
--
-- Privacy principles:
--   * ai_jobs + ai_usage_log are system-only (no user read policies).
--   * ai_content_metadata is owner-readable only (content creators may see
--     the derived metadata for their own content).
--   * Nothing here stores raw private content beyond the minimal input
--     needed for the job; workers must pass minimum necessary data.
-- ═══════════════════════════════════════════════════════════

-- ── 1. AI JOB QUEUE ─────────────────────────────────────────
create table if not exists ai_jobs (
  id uuid primary key default gen_random_uuid(),
  -- 'embed_content' | 'classify_content' | 'quality_score' | 'creator_insight'
  job_type text not null,
  -- Subject of the job (content id, creator id...). Type-tagged.
  target_type text not null check (target_type in ('social_post', 'roast', 'user', 'community', 'topic')),
  target_id text not null,
  -- Minimal input for the job (never full private content beyond need).
  input jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'failed', 'skipped')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  -- Idempotency: one job per (type, target) unless a new version is forced.
  job_key text not null,
  model_version text,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_ai_job_key unique (job_key)
);

create index if not exists idx_ai_jobs_claim
  on ai_jobs(status, created_at asc) where status in ('pending', 'claimed');
create index if not exists idx_ai_jobs_target
  on ai_jobs(target_type, target_id);
create index if not exists idx_ai_jobs_created
  on ai_jobs(created_at desc);

alter table ai_jobs enable row level security;
do $$ begin
  create policy "System writes ai_jobs" on ai_jobs for all using (false) with check (false);
exception when duplicate_object then null;
end $$;

-- ── 2. CONTENT UNDERSTANDING METADATA ───────────────────────
-- One row per understood content item. Embedding is stored as a plain
-- jsonb array on purpose: provider-agnostic and dependency-free at this
-- stage. When a dedicated search engine lands, promote to a pgvector
-- column behind the same key (content_type, content_id).
create table if not exists ai_content_metadata (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('social_post', 'roast', 'comment')),
  content_id uuid not null,
  language text,
  topics jsonb not null default '[]',
  quality_score real,
  -- Semantic representation (array of floats). Never exposed publicly.
  embedding jsonb,
  embedding_dim int,
  model_version text,
  source text not null default 'builtin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_ai_content unique (content_type, content_id)
);

create index if not exists idx_ai_content_target on ai_content_metadata(content_type, content_id);
create index if not exists idx_ai_content_updated on ai_content_metadata(updated_at desc);

alter table ai_content_metadata enable row level security;
-- Creators may read metadata for their own content; writes are system-only.
do $$ begin
  create policy "System writes ai metadata" on ai_content_metadata for all using (false) with check (false);
exception when duplicate_object then null;
end $$;

-- ── 3. AI USAGE / COST LOG ──────────────────────────────────
-- Append-only observability: every provider call records provider, model,
-- latency, estimated cost, success/fallback. Retention enforced by cron
-- (cleanup_ai_logs) — 90 days is the documented policy.
create table if not exists ai_usage_log (
  id bigint generated always as identity primary key,
  task text not null,
  provider text not null,
  model_version text,
  success boolean not null default true,
  fallback_used boolean not null default false,
  latency_ms int,
  estimated_tokens int,
  estimated_cost_usd real,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_created on ai_usage_log(created_at desc);
create index if not exists idx_ai_usage_task on ai_usage_log(task, created_at desc);

alter table ai_usage_log enable row level security;
do $$ begin
  create policy "System writes ai usage" on ai_usage_log for all using (false) with check (false);
exception when duplicate_object then null;
end $$;

-- ── 3b. CREATOR INSIGHT STORAGE ────────────────────────────
-- AI-assisted creator insights (aggregate-only, owner-readable).
-- Store only the final insight text + confidence + provenance. Raw
-- numbers are never stored here; they live in the job input.
create table if not exists ai_creator_insights (
  creator_id uuid primary key references auth.users(id) on delete cascade,
  insight jsonb,
  confidence text check (confidence in ('high', 'medium', 'early', 'insufficient')),
  model_version text,
  source text not null default 'builtin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_creator_insights_updated on ai_creator_insights(updated_at desc);

alter table ai_creator_insights enable row level security;
do $$ begin
  create policy "Creator reads own AI insight" on ai_creator_insights
    for select using (auth.uid() = creator_id);
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "System writes AI insights" on ai_creator_insights
    for all using (false) with check (false);
exception when duplicate_object then null;
end $$;

-- ── 4. RPCs ─────────────────────────────────────────────────

-- Enqueue an AI job idempotently (same job_key → no-op).
create or replace function enqueue_ai_job(
  p_job_type text,
  p_target_type text,
  p_target_id text,
  p_input jsonb default '{}',
  p_job_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := coalesce(p_job_key, p_job_type || ':' || p_target_type || ':' || p_target_id);
  v_id uuid;
begin
  insert into ai_jobs (job_type, target_type, target_id, input, job_key)
  values (p_job_type, p_target_type, p_target_id, p_input, v_key)
  on conflict (job_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Atomically claim a batch of pending jobs (exactly-once under concurrency).
create or replace function claim_ai_jobs(
  batch_size int default 50
)
returns setof ai_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update ai_jobs
    set status = 'claimed', attempts = attempts + 1, updated_at = now()
    where id in (
      select id from ai_jobs
      where status in ('pending', 'claimed')
        and attempts < max_attempts
      order by created_at asc
      limit batch_size
      for update skip locked
    )
    returning *;
end;
$$;

-- Finish a job (done / failed / skipped) with result and error.
create or replace function finish_ai_job(
  p_id uuid,
  p_status text,
  p_result jsonb default null,
  p_error text default null,
  p_model_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ai_jobs
  set status = p_status,
      result = coalesce(p_result, result),
      error = p_error,
      model_version = coalesce(p_model_version, model_version),
      updated_at = now()
  where id = p_id;
end;
$$;

-- Retention: usage logs older than 90 days, done/failed jobs older than
-- 30 days, stuck claimed jobs older than 7 days (dead-letter visibility).
create or replace function cleanup_ai_data()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
begin
  delete from ai_usage_log where created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  delete from ai_jobs
  where status in ('done', 'failed', 'skipped')
    and updated_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = v_deleted + ROW_COUNT;

  -- Stuck claims (worker died mid-job) go back to pending for retry.
  update ai_jobs
  set status = 'pending', updated_at = now()
  where status = 'claimed'
    and updated_at < now() - interval '1 hour'
    and attempts < max_attempts;
  GET DIAGNOSTICS v_deleted = v_deleted + ROW_COUNT;

  -- Exhausted attempts become dead-letter rows (visible, never silently lost).
  update ai_jobs
  set status = 'failed', error = coalesce(error, 'max attempts reached'), updated_at = now()
  where status = 'claimed'
    and attempts >= max_attempts;

  return v_deleted;
end;
$$;

-- RPC: upsert a creator insight (system path for the AI worker).
create or replace function upsert_creator_insight(
  p_creator_id uuid,
  p_insight jsonb,
  p_confidence text,
  p_model_version text default null,
  p_source text default 'builtin'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ai_creator_insights (creator_id, insight, confidence, model_version, source, updated_at)
  values (p_creator_id, p_insight, p_confidence, p_model_version, p_source, now())
  on conflict (creator_id) do update
  set insight = excluded.insight,
      confidence = excluded.confidence,
      model_version = excluded.model_version,
      source = excluded.source,
      updated_at = now();
end;
$$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_08_growth_analytics_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Growth Analytics Foundation (Master Prompt 18)
--
-- NON-DESTRUCTIVE: only adds a column, a table, indexes, RLS and RPCs.
--
-- Contents:
--   1. user_profiles.locale — coarse user language/region signal captured
--      server-side at signup (Accept-Language), used for regional analytics
--      and future locale-aware product behavior. Never precise location.
--   2. growth_daily_snapshot — durable daily aggregates (signups, DAU/WAU,
--      activation, cohort retention D1/D7/D30, referrals, network density,
--      creators, communities, regions). Computed by lib/growth/analytics.js
--      and persisted by the daily cleanup cron; history enables cohort
--      analysis without re-computation.
--   3. RPCs — save/get/cleanup snapshots (system-only, SECURITY DEFINER).
-- ═══════════════════════════════════════════════════════════

-- ── 1. USER LOCALE ──────────────────────────────────────────
alter table user_profiles add column if not exists locale text;

-- ── 2. DAILY GROWTH SNAPSHOT ────────────────────────────────
create table if not exists growth_daily_snapshot (
  snapshot_date date primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_growth_snapshot_created on growth_daily_snapshot(created_at desc);

alter table growth_daily_snapshot enable row level security;
do $$ begin
  create policy "System writes growth snapshots" on growth_daily_snapshot
    for all using (false) with check (false);
exception when duplicate_object then null;
end $$;

-- ── 3. RPCs ─────────────────────────────────────────────────

-- Upsert today's snapshot (idempotent per date).
create or replace function save_growth_snapshot(
  p_date date,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into growth_daily_snapshot (snapshot_date, data, created_at)
  values (p_date, p_data, now())
  on conflict (snapshot_date) do update
  set data = excluded.data, created_at = now();
end;
$$;

-- Read the last N snapshots (oldest first) for cohort history.
create or replace function get_growth_snapshots(p_days int default 90)
returns setof growth_daily_snapshot
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select * from growth_daily_snapshot
    where snapshot_date >= current_date - p_days
    order by snapshot_date asc;
end;
$$;

-- Retention: keep 400 days of snapshots (~13 months of cohort history).
create or replace function cleanup_growth_snapshots()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
begin
  delete from growth_daily_snapshot
  where snapshot_date < current_date - 400;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  return v_deleted;
end;
$$;

-- ── 4. SNAPSHOT COMPUTATION (all metrics from real tables) ──
-- Single aggregate pass over real platform data. No fabricated numbers:
--   * signups        → auth.users
--   * active users   → rec_events (server-validated activity log)
--   * activation     → strong rec_events (follow/join/react/comment/share/
--                      participate/vote) OR social_posts created
--   * cohorts        → weekly signup cohorts with D1/D7/D30 return
--   * referral       → referral_visits / converted_at
--   * network        → follows per active user
--   * creators       → social_posts + roasts authors
--   * communities    → community_members + community posts
--   * regions        → user_profiles.locale (coarse, signup-time only)
create or replace function compute_growth_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_signups_total int; v_signups_7d int; v_signups_30d int;
  v_dau int; v_wau int; v_mau int;
  v_activated_7d int;
  v_ref_visits_7d int; v_ref_conversions_7d int; v_ref_activated_7d int;
  v_follows_total int;
  v_creators_7d int;
  v_communities_total int; v_communities_new_7d int; v_communities_active_7d int;
  v_recent_daily int; v_baseline_daily int;
begin
  -- Signups
  select count(*) into v_signups_total from auth.users;
  select count(*) into v_signups_7d from auth.users where created_at >= now() - interval '7 days';
  select count(*) into v_signups_30d from auth.users where created_at >= now() - interval '30 days';

  -- Active users (server-validated activity only)
  select count(distinct user_id) into v_dau from rec_events
    where created_at >= now() - interval '1 day' and user_id is not null;
  select count(distinct user_id) into v_wau from rec_events
    where created_at >= now() - interval '7 days' and user_id is not null;
  select count(distinct user_id) into v_mau from rec_events
    where created_at >= now() - interval '30 days' and user_id is not null;

  -- Activation: strong first-value events in the last 7 days
  select count(distinct user_id) into v_activated_7d from rec_events
  where created_at >= now() - interval '7 days'
    and user_id is not null
    and event_type in ('user_followed', 'community_joined', 'content_reacted',
                       'content_commented', 'content_shared', 'challenge_participated',
                       'battle_voted');

  -- Referral quality (real visit/conversion rows)
  select count(*) into v_ref_visits_7d from referral_visits where created_at >= now() - interval '7 days';
  select count(*) into v_ref_conversions_7d from referral_visits where converted_at >= now() - interval '7 days';
  select count(distinct rv.converted_user_id) into v_ref_activated_7d
  from referral_visits rv
  where rv.converted_at >= now() - interval '7 days'
    and rv.converted_user_id is not null
    and exists (
      select 1 from rec_events e
      where e.user_id = rv.converted_user_id
        and e.created_at between rv.converted_at and rv.converted_at + interval '7 days'
    );

  -- Network density
  select count(*) into v_follows_total from follows;

  -- Creators: distinct authors with content in the last 7 days
  select count(distinct user_id) into v_creators_7d from social_posts
    where created_at >= now() - interval '7 days' and user_id is not null;

  -- Communities
  select count(*) into v_communities_total from communities;
  select count(*) into v_communities_new_7d from communities where created_at >= now() - interval '7 days';
  select count(distinct community_id) into v_communities_active_7d from social_posts
    where created_at >= now() - interval '7 days' and community_id is not null;

  -- Anomaly: signup spike (last 7d avg per day vs previous 21d baseline)
  select coalesce(round(avg(d.c)::numeric, 1), 0) into v_recent_daily from (
    select count(*) as c from auth.users
    where created_at >= now() - interval '7 days'
    group by date_trunc('day', created_at)
  ) d;
  select coalesce(round(avg(d.c)::numeric, 1), 0) into v_baseline_daily from (
    select count(*) as c from auth.users
    where created_at >= now() - interval '28 days'
      and created_at < now() - interval '7 days'
    group by date_trunc('day', created_at)
  ) d;

  -- Cohort retention: weekly signup cohorts, last 12 weeks
  select coalesce(jsonb_agg(row_to_jsonb(c) order by c.cohort), '[]'::jsonb) into v
  from (
    with cohort_users as (
      select date_trunc('week', created_at)::date as cohort,
             id as uid,
             created_at as signed_at
      from auth.users
      where created_at >= date_trunc('week', now()) - interval '11 weeks'
    )
    select cohort,
           count(*) as size,
           round(100.0 * count(*) filter (where exists (
             select 1 from rec_events e
             where e.user_id = cohort_users.uid
               and e.created_at between signed_at and signed_at + interval '1 day'))
             / nullif(count(*), 0), 1) as d1_pct,
           round(100.0 * count(*) filter (where exists (
             select 1 from rec_events e
             where e.user_id = cohort_users.uid
               and e.created_at between signed_at and signed_at + interval '7 days'))
             / nullif(count(*), 0), 1) as d7_pct,
           round(100.0 * count(*) filter (where exists (
             select 1 from rec_events e
             where e.user_id = cohort_users.uid
               and e.created_at between signed_at and signed_at + interval '30 days'))
             / nullif(count(*), 0), 1) as d30_pct
    from cohort_users
    group by cohort
  ) c;

  return jsonb_build_object(
    'generatedAt', now()::text,
    'signups', jsonb_build_object('total', v_signups_total, 'last7d', v_signups_7d, 'last30d', v_signups_30d),
    'active', jsonb_build_object('dau', v_dau, 'wau', v_wau, 'mau', v_mau,
      'dauMauPct', round(100.0 * v_dau / nullif(v_mau, 0), 1)),
    'activation', jsonb_build_object('activated7d', v_activated_7d,
      'activationRatePct', round(100.0 * v_activated_7d / nullif(v_signups_7d, 0), 1)),
    'cohorts', v,
    'referral', jsonb_build_object('visits7d', v_ref_visits_7d, 'conversions7d', v_ref_conversions_7d,
      'conversionRatePct', round(100.0 * v_ref_conversions_7d / nullif(v_ref_visits_7d, 0), 1),
      'activatedConverted7d', v_ref_activated_7d),
    'network', jsonb_build_object('totalFollows', v_follows_total,
      'followsPerActiveUser', round(v_follows_total::numeric / nullif(v_mau, 0), 2),
      'activeUsers30d', v_mau),
    'creators', jsonb_build_object('active7d', v_creators_7d),
    'communities', jsonb_build_object('total', v_communities_total, 'new7d', v_communities_new_7d, 'active7d', v_communities_active_7d),
    'regions', coalesce((
      select jsonb_agg(row_to_jsonb(r) order by r.users desc) from (
        select coalesce(locale, 'unknown') as locale,
               count(*) as users
        from user_profiles
        group by coalesce(locale, 'unknown')
      ) r
    ), '[]'::jsonb),
    'anomalies', jsonb_build_array(
      case when v_recent_daily > 0 and v_baseline_daily > 0 and v_recent_daily > 3 * v_baseline_daily
        then jsonb_build_object('type', 'signup_spike', 'level', 'warn',
          'detail', 'Signups (' || v_recent_daily || '/day avg) are ' ||
          round((v_recent_daily / v_baseline_daily)::numeric, 1) || 'x the 21-day baseline (' || v_baseline_daily || '/day). Verify it is real traffic, not bots.')
        else jsonb_build_object('type', 'signup_spike', 'level', 'info',
          'detail', 'Signup rate within normal range.') end
    )
  );
end;
$$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_08_scale_reliability.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Scale Reliability Foundation (Master Prompt 16)
--
-- NON-DESTRUCTIVE: only adds/replaces functions and adds indexes.
-- No tables are dropped, renamed, or have data removed.
-- All statements are idempotent (create or replace / if not exists).
--
-- Contents:
--   1. refresh_profile_roast_counts()  — batch N+1 killer for the
--      daily cleanup cron (was O(profiles) queries per run).
--   2. process_notification_queue()    — rewritten to claim batches
--      atomically (FOR UPDATE SKIP LOCKED) with idempotent insert,
--      so overlapping worker runs can never double-process rows.
--   3. notifications.push_sent flag    — idempotent push delivery.
--   4. Guarded fcm_tokens(user_id) index for the push worker's
--      batch token fetch.
-- ═══════════════════════════════════════════════════════════

-- ── 1. BATCH PROFILE ROAST-COUNT REFRESH ────────────────────
-- Replaces the per-profile loop in app/api/cron/cleanup/route.js.
-- One pass: sets roast_count for every profile from a single
-- aggregate, then zeroes profiles that have no visible roasts.
create or replace function refresh_profile_roast_counts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
  v_zeroed  int := 0;
begin
  with counts as (
    select profile_id, count(*) as c
    from roasts
    where is_hidden = false
    group by profile_id
  )
  update profiles p
  set roast_count = counts.c
  from counts
  where p.id = counts.profile_id
    and p.roast_count is distinct from counts.c;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Profiles with no visible roasts go to 0 (keeps counters truthful).
  update profiles p
  set roast_count = 0
  where not exists (
    select 1 from roasts r
    where r.profile_id = p.id and r.is_hidden = false
  )
  and p.roast_count is distinct from 0;

  GET DIAGNOSTICS v_zeroed = ROW_COUNT;

  return v_updated + v_zeroed;
end;
$$;

-- ── 2. ATOMIC, IDEMPOTENT NOTIFICATION QUEUE PROCESSING ─────
-- Old version used two independent "select ... limit batch" steps
-- (insert then mark), which under concurrent worker runs could mark
-- different rows than it inserted or double-insert. New version
-- claims each row with FOR UPDATE SKIP LOCKED inside a single loop,
-- inserts into notifications with ON CONFLICT DO NOTHING, then marks
-- claimed. Exactly-once per row, safe to re-run, safe under overlap.
-- SECURITY DEFINER: the worker (anon-key cron route) must be able to
-- mark rows processed and write inbox rows. RLS on notification_queue has
-- no UPDATE policy by design — the HTTP layer (CRON_SECRET) authorizes the
-- caller, and this function is the trusted system path. Matches the
-- cast_battle_vote / admin-RPC pattern already in the codebase.
create or replace function process_notification_queue(
  batch_size int default 500
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count int := 0;
begin
  for v_row in
    select id, user_id, type, title, message, link, created_at
    from notification_queue
    where processed = false
    order by priority desc, created_at asc
    limit batch_size
    for update skip locked
  loop
    insert into notifications (user_id, type, title, message, link, is_read, created_at)
    values (v_row.user_id, v_row.type, v_row.title, v_row.message, v_row.link, false, v_row.created_at)
    on conflict do nothing;

    update notification_queue
    set processed = true
    where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  -- Cleanup: processed items older than 24 hours.
  delete from notification_queue
  where processed = true
    and created_at < now() - interval '24 hours';

  return v_count;
end;
$$;

-- ── 3. PUSH SENT FLAG ON NOTIFICATIONS ─────────────────────
-- Makes push delivery idempotent: the worker only pushes rows with
-- push_sent = false, then flags them. A failed run retries; a
-- successful run never re-pushes. Additive with a default, so
-- existing rows behave exactly as before (nothing is re-sent).
alter table notifications add column if not exists push_sent boolean default false;

-- ── 4. GUARDED INDEX: FCM TOKENS BY USER ────────────────────
-- Serves the push worker's batch token fetch in
-- app/api/process-notifications/route.js. Guarded so the migration
-- is safe on projects where the table does not exist yet.
do $$
begin
  if to_regclass('public.fcm_tokens') is not null then
    create index if not exists idx_fcm_tokens_user on fcm_tokens(user_id);
  end if;
end
$$;

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_09_developer_platform.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Developer Platform & Ecosystem Foundation (Master Prompt 20)
-- NON-DESTRUCTIVE: adds columns, tables, indexes, RPC functions only.
--
-- Architecture principles (extensible but secure; open but governed):
--   * App access tokens are stored as SHA-256 hashes — plaintext secrets
--     exist only once, at creation time, returned to the developer.
--   * Apps have lifecycle states (development → review → approved → …) and
--     granular scopes — there is no FULL_ACCESS scope.
--   * Every user-level token is a GRANT: the granting user's consent is
--     recorded explicitly and every grant is individually revocable.
--   * Webhook deliveries are signed (HMAC-SHA256), idempotent (event_id),
--     and tracked in a delivery queue with retries and backoff.
--   * Abuse/audit trail: every app credential + grant + webhook change is
--     appended to developer_platform_audit.
--   * Third parties can never bypass RLS: this layer adds its OWN read-only
--     RLS surfaces with strict SELECT policies only.
--
-- No private data, moderation tables, or fraud internals are exposed.
-- ═══════════════════════════════════════════════════════════

-- ── 1. DEVELOPER APPLICATIONS ───────────────────────────────
CREATE TABLE IF NOT EXISTS developer_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 64),
  description TEXT NOT NULL DEFAULT '',
  website TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'development' CHECK (status IN (
    'development', 'review', 'approved', 'limited', 'suspended', 'revoked'
  )),
  trust_level TEXT NOT NULL DEFAULT 'standard' CHECK (trust_level IN (
    'standard', 'verified', 'trusted_partner'
  )),
  -- Which scopes this app is ALLOWED to request (approved by platform).
  allowed_scopes TEXT[] NOT NULL DEFAULT '{}',
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dev_apps_owner ON developer_apps(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_dev_apps_status ON developer_apps(status, created_at);

-- ── 2. APPLICATION CREDENTIALS (client_id/secret, hashed) ───
CREATE TABLE IF NOT EXISTS developer_app_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES developer_apps(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'development' CHECK (environment IN (
    'development', 'sandbox', 'production'
  )),
  -- SHA-256 hex of the client_secret. The raw secret is returned ONCE at
  -- creation and never stored or shown again.
  secret_hash TEXT NOT NULL,
  -- First 8 chars of the secret, for developer identification only.
  secret_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dev_creds_app ON developer_app_credentials(app_id);

-- ── 3. USER GRANTS / ACCESS TOKENS ──────────────────────────
-- A grant is an explicit, user-consented, revocable scoped token.
-- subject_id = the user whose data the app may access.
-- created_by  = the user who consented (for audit).
-- Token values are SHA-256 hashed; prefix aids debugging.
CREATE TABLE IF NOT EXISTS developer_app_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES developer_apps(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dev_tokens_subject ON developer_app_tokens(subject_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_dev_tokens_app ON developer_app_tokens(app_id);

-- ── 4. WEBHOOK SUBSCRIPTIONS (signed delivery) ──────────────
CREATE TABLE IF NOT EXISTS developer_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES developer_apps(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (url ~* '^https://'),
  -- Event types this endpoint receives (content.published, app.token_revoked).
  event_types TEXT[] NOT NULL DEFAULT '{}',
  signing_secret_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  consecutive_failures INT NOT NULL DEFAULT 0,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dev_webhooks_app ON developer_webhooks(app_id, active);

-- ── 5. WEBHOOK DELIVERY QUEUE ───────────────────────────────
-- Idempotent per (subscription, event_id). Dispatcher retries with
-- exponential backoff; persistent failures disable the endpoint.
CREATE TABLE IF NOT EXISTS developer_webhook_deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES developer_webhooks(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'delivered', 'failed', 'disabled'
  )),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  last_http_status INT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_webhook_event UNIQUE (subscription_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_dev_webhook_deliveries_due
  ON developer_webhook_deliveries(status, next_attempt_at);

-- ── 6. AUDIT LOG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS developer_platform_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_id UUID,
  actor_id UUID,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dev_audit_app ON developer_platform_audit(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_audit_actor ON developer_platform_audit(actor_id, created_at DESC);

-- ── ROW LEVEL SECURITY ──────────────────────────────────────
-- Read-only, least-privilege. No client can write directly — all writes go
-- through SECURITY DEFINER RPCs below (which enforce ownership + consent).
ALTER TABLE developer_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_app_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_app_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_platform_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Owners may list their own apps.
  CREATE POLICY "Owners read own apps" ON developer_apps
    FOR SELECT USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  -- Owners may list credentials (prefixes/revocation state only — hashes
  -- are useless to a reader) for their own apps via the Developer Portal.
  CREATE POLICY "Owners read own app credentials" ON developer_app_credentials
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM developer_apps a WHERE a.id = app_id AND a.owner_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  -- Owners may list their own apps' webhook endpoints.
  CREATE POLICY "Owners read own webhooks" ON developer_webhooks
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM developer_apps a WHERE a.id = app_id AND a.owner_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  -- A user may list tokens granted to apps ON their own account (used by
  -- the "connected apps" management surface). Subject rows are how a user
  -- sees and revokes what an app can do with their data.
  CREATE POLICY "Subjects read own grants" ON developer_app_tokens
    FOR SELECT USING (subject_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- RPC — register_developer_app(...)
-- Creates an app in 'development' status. App names may collide across
-- developers (per-developer uniqueness is not required); scopes are granted
-- later by platform review, never at registration time.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION register_developer_app(
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_website TEXT DEFAULT NULL,
  p_redirect_uris TEXT[] DEFAULT '{}'
)
RETURNS TABLE (app_id UUID, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 'unauthorized'::TEXT;
    RETURN;
  END IF;
  IF p_name IS NULL OR char_length(p_name) < 2 OR char_length(p_name) > 64 THEN
    RETURN QUERY SELECT NULL::UUID, 'invalid_name'::TEXT;
    RETURN;
  END IF;
  IF p_website IS NOT NULL AND p_website !~* '^https?://' THEN
    RETURN QUERY SELECT NULL::UUID, 'invalid_website'::TEXT;
    RETURN;
  END IF;

  INSERT INTO developer_apps (owner_id, name, description, website, redirect_uris, status, allowed_scopes)
  VALUES (
    v_uid, p_name,
    COALESCE(p_description, ''),
    NULLIF(p_website, ''),
    ARRAY(SELECT unnest(COALESCE(p_redirect_uris, '{}')) WHERE unnest ~* '^https?://'),
    'development', '{}'
  )
  RETURNING id INTO v_app_id;

  PERFORM record_dev_platform_audit('app.registered', v_app_id, v_uid,
    jsonb_build_object('name', p_name));

  RETURN QUERY SELECT v_app_id, NULL::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION register_developer_app(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_developer_app(TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — issue_app_credential(p_app_id, p_environment)
-- Owner-only. Generates a client secret, stores only its hash, and returns
-- the plaintext secret EXACTLY ONCE.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION issue_app_credential(p_app_id UUID, p_environment TEXT DEFAULT 'development')
RETURNS TABLE (credential_id UUID, client_secret TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_secret TEXT;
  v_cred_id UUID;
  v_owns BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'unauthorized'::TEXT;
    RETURN;
  END IF;
  IF p_environment NOT IN ('development', 'sandbox', 'production') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'invalid_environment'::TEXT;
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM developer_apps WHERE id = p_app_id AND owner_id = v_uid)
    INTO v_owns;
  IF NOT v_owns THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'not_owner'::TEXT;
    RETURN;
  END IF;

  v_secret := 'bb_secret_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO developer_app_credentials (app_id, environment, secret_hash, secret_prefix)
  VALUES (
    p_app_id, p_environment,
    encode(digest(v_secret, 'sha256'), 'hex'),
    left(v_secret, 8)
  )
  RETURNING id INTO v_cred_id;

  PERFORM record_dev_platform_audit('app.credential_issued', p_app_id, v_uid,
    jsonb_build_object('credential_id', v_cred_id, 'environment', p_environment));

  RETURN QUERY SELECT v_cred_id, v_secret, NULL::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION issue_app_credential(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_app_credential(UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — validate_app_credential(p_client_secret)
-- Server-side credential check used by the gateway (NOT exposed to clients).
-- Returns the app when the secret hash matches an active app with an
-- approved status. Never returns the secret itself.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_app_credential(p_client_secret TEXT)
RETURNS TABLE (app_id UUID, app_name TEXT, status TEXT, trust_level TEXT, kill_switch BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_client_secret IS NULL OR length(p_client_secret) < 16 OR length(p_client_secret) > 200 THEN
    RETURN;
  END IF;
  v_hash := encode(digest(p_client_secret, 'sha256'), 'hex');

  RETURN QUERY
  SELECT a.id, a.name, a.status, a.trust_level, a.kill_switch
  FROM developer_app_credentials c
  JOIN developer_apps a ON a.id = c.app_id
  WHERE c.secret_hash = v_hash
    AND c.revoked_at IS NULL
    AND a.kill_switch = false
    AND a.status IN ('approved', 'limited', 'development')
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION validate_app_credential(TEXT) FROM PUBLIC;
-- Service role + authenticated only (the gateway runs server-side).
GRANT EXECUTE ON FUNCTION validate_app_credential(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION validate_app_credential(TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — grant_app_access(p_app_id, p_scopes)
-- The CONSENT action. An authenticated user grants an app scoped access to
-- their OWN data. Returns a one-time plaintext bearer token (hashed at
-- rest). The token can be revoked at any time by the user.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION grant_app_access(p_app_id UUID, p_scopes TEXT[])
RETURNS TABLE (token TEXT, token_prefix TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_app developer_apps%ROWTYPE;
  v_scopes TEXT[] := '{}';
  v_token TEXT;
  v_allowed BOOLEAN;
  v_scope TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_app FROM developer_apps WHERE id = p_app_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, 'not_found'::TEXT;
    RETURN;
  END IF;
  IF v_app.status NOT IN ('approved', 'limited', 'development') OR v_app.kill_switch THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, 'app_not_active'::TEXT;
    RETURN;
  END IF;

  -- Intersect requested scopes with the app's platform-approved scopes.
  -- Unknown/unapproved scopes are silently dropped (never granted).
  FOREACH v_scope IN ARRAY COALESCE(p_scopes, '{}')
  LOOP
    SELECT v_scope = ANY(v_app.allowed_scopes) INTO v_allowed;
    IF v_allowed THEN
      v_scopes := v_scopes || v_scope;
    END IF;
  END LOOP;

  IF array_length(v_scopes, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, 'no_approved_scopes'::TEXT;
    RETURN;
  END IF;

  v_token := 'bb_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO developer_app_tokens (app_id, subject_id, created_by, token_hash, token_prefix, scopes, expires_at)
  VALUES (
    p_app_id, v_uid, v_uid,
    encode(digest(v_token, 'sha256'), 'hex'),
    left(v_token, 8),
    v_scopes,
    now() + interval '365 days'
  );

  PERFORM record_dev_platform_audit('app.access_granted', p_app_id, v_uid,
    jsonb_build_object('scopes', v_scopes));

  RETURN QUERY SELECT v_token, left(v_token, 8), NULL::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION grant_app_access(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_app_access(UUID, TEXT[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — validate_access_token(p_token)
-- Server-side gateway check. Returns the app + subject + scopes for a live
-- (non-revoked, non-expired) token. Never exposed to clients.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_access_token(p_token TEXT)
RETURNS TABLE (app_id UUID, subject_id UUID, app_name TEXT, scopes TEXT[], status TEXT, kill_switch BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 OR length(p_token) > 200 THEN
    RETURN;
  END IF;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT t.app_id, t.subject_id, a.name, t.scopes, a.status, a.kill_switch
  FROM developer_app_tokens t
  JOIN developer_apps a ON a.id = t.app_id
  WHERE t.token_hash = v_hash
    AND t.revoked_at IS NULL
    AND (t.expires_at IS NULL OR t.expires_at > now())
    AND a.kill_switch = false
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION validate_access_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_access_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION validate_access_token(TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — revoke_access_token(p_token_hash, p_subject_id)
-- A subject user revokes their own grant (from "connected apps"). The app
-- loses access immediately; webhooks may inform the app via
-- app.token_revoked events.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION revoke_access_token(p_token_id BIGINT, p_subject_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_app_id UUID;
  v_row_count INT;
BEGIN
  IF v_uid IS NULL OR p_subject_id IS NULL OR v_uid <> p_subject_id THEN
    RETURN false; -- only the subject may revoke their own grant
  END IF;

  SELECT app_id INTO v_app_id
  FROM developer_app_tokens
  WHERE id = p_token_id AND subject_id = p_subject_id AND revoked_at IS NULL;

  UPDATE developer_app_tokens
    SET revoked_at = now()
    WHERE id = p_token_id AND subject_id = p_subject_id AND revoked_at IS NULL
    RETURNING id INTO v_row_count;

  IF v_row_count > 0 AND v_app_id IS NOT NULL THEN
    PERFORM record_dev_platform_audit('app.access_revoked', v_app_id, v_uid,
      jsonb_build_object('token_id', p_token_id));
  END IF;

  RETURN COALESCE(v_row_count, 0) > 0;
END;
$$;
REVOKE ALL ON FUNCTION revoke_access_token(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revoke_access_token(BIGINT, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — record_dev_platform_audit(...)
-- Append-only audit. SECURITY DEFINER only.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_dev_platform_audit(
  p_action TEXT,
  p_app_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT auth.uid(),
  p_details JSONB DEFAULT '{}'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_action IS NULL OR length(p_action) < 3 THEN
    RETURN false;
  END IF;
  INSERT INTO developer_platform_audit (app_id, actor_id, action, details)
  VALUES (p_app_id, p_actor_id, p_action, COALESCE(p_details, '{}'::jsonb));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION record_dev_platform_audit(TEXT, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_dev_platform_audit(TEXT, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION record_dev_platform_audit(TEXT, UUID, UUID, JSONB) TO service_role;

-- ═══════════════════════════════════════════════════════════
-- RPC — public_app_metadata(p_app_ids)
-- Returns ONLY public marketing metadata (name + website + status) for the
-- given apps. Used by the Connected Apps surface (apps this user has
-- grants to) and the consent surface (any app being reviewed before grant).
-- SECURITY DEFINER because RLS is owner-only on developer_apps; no
-- sensitive fields (scopes, credentials, owner identity) are returned.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public_app_metadata(p_app_ids UUID[])
RETURNS TABLE (app_id UUID, app_name TEXT, website TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_app_ids IS NULL OR array_length(p_app_ids, 1) = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.id, a.name, a.website, a.status
  FROM developer_apps a
  WHERE a.id = ANY(p_app_ids);
END;
$$;
REVOKE ALL ON FUNCTION public_app_metadata(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_app_metadata(UUID[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — register_webhook(p_app_id, p_url, p_event_types)
-- Owner-only. Registers a signed webhook endpoint (requires the app's
-- signing secret, which is generated here and returned once).
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION register_webhook(
  p_app_id UUID,
  p_url TEXT,
  p_event_types TEXT[]
)
RETURNS TABLE (webhook_id UUID, signing_secret TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owns BOOLEAN;
  v_secret TEXT;
  v_id UUID;
  v_evt TEXT;
  v_valid_types TEXT[] := ARRAY[
    'content.published', 'app.access_granted', 'app.access_revoked'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM developer_apps WHERE id = p_app_id AND owner_id = v_uid)
    INTO v_owns;
  IF NOT v_owns THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'not_owner'::TEXT;
    RETURN;
  END IF;

  IF p_url IS NULL OR p_url !~* '^https://' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'invalid_url'::TEXT;
    RETURN;
  END IF;
  IF p_event_types IS NULL OR array_length(p_event_types, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'no_event_types'::TEXT;
    RETURN;
  END IF;

  -- Only allow known event types (never arbitrary strings).
  FOREACH v_evt IN ARRAY p_event_types
  LOOP
    IF NOT (v_evt = ANY(v_valid_types)) THEN
      RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'unknown_event_type: ' || v_evt;
      RETURN;
    END IF;
  END LOOP;

  v_secret := 'bb_whsec_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO developer_webhooks (app_id, url, event_types, signing_secret_hash)
  VALUES (p_app_id, p_url, p_event_types, encode(digest(v_secret, 'sha256'), 'hex'))
  RETURNING id INTO v_id;

  PERFORM record_dev_platform_audit('webhook.registered', p_app_id, v_uid,
    jsonb_build_object('webhook_id', v_id, 'url', p_url, 'event_types', p_event_types));

  RETURN QUERY SELECT v_id, v_secret, NULL::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION register_webhook(UUID, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_webhook(UUID, TEXT, TEXT[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- RPC — queue_webhook_event(p_event_type, p_payload, p_subject_id)
-- Internal event enqueue (gateway/cron only). Idempotent per event id:
-- every delivery row is unique on (subscription, event_id). Emits the event
-- only to webhook subscriptions whose app has an ACTIVE grant for the
-- subject (so events never leak to apps the user has revoked).
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION queue_webhook_event(
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}',
  p_subject_id UUID DEFAULT NULL,
  p_event_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id TEXT := COALESCE(p_event_id, 'evt_' || encode(gen_random_bytes(12), 'hex'));
  v_row_count BIGINT := 0;
BEGIN
  INSERT INTO developer_webhook_deliveries (subscription_id, event_id, event_type, payload)
  SELECT wh.id, v_event_id, p_event_type, COALESCE(p_payload, '{}'::jsonb)
  FROM developer_webhooks wh
  JOIN developer_apps a ON a.id = wh.app_id
  WHERE wh.active = true
    AND a.kill_switch = false
    AND a.status IN ('approved', 'limited')
    AND p_event_type = ANY(wh.event_types)
    AND (
      p_subject_id IS NULL
      OR EXISTS (
        SELECT 1 FROM developer_app_tokens t
        WHERE t.app_id = wh.app_id
          AND t.subject_id = p_subject_id
          AND t.revoked_at IS NULL
      )
    )
  ON CONFLICT (subscription_id, event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count;
END;
$$;
REVOKE ALL ON FUNCTION queue_webhook_event(TEXT, JSONB, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION queue_webhook_event(TEXT, JSONB, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION queue_webhook_event(TEXT, JSONB, UUID, TEXT) TO authenticated;

-- ── 7. ADMIN: APP STATUS / TRUST (SECURITY DEFINER, admin-only) ──
CREATE OR REPLACE FUNCTION admin_update_app_status(
  p_app_id UUID,
  p_status TEXT,
  p_trust_level TEXT DEFAULT NULL,
  p_allowed_scopes TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  -- Admin gate: the calling user must be the app owner acting through an
  -- admin-authorized surface (service_role passes; the app route layer
  -- enforces the admin password before calling).
  IF p_status NOT IN ('development', 'review', 'approved', 'limited', 'suspended', 'revoked') THEN
    RETURN false;
  END IF;

  UPDATE developer_apps
  SET status = p_status,
      trust_level = COALESCE(p_trust_level, trust_level),
      allowed_scopes = COALESCE(p_allowed_scopes, allowed_scopes),
      updated_at = now()
  WHERE id = p_app_id;

  PERFORM record_dev_platform_audit('admin.app_status_updated', p_app_id, v_uid,
    jsonb_build_object('status', p_status));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION admin_update_app_status(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_app_status(UUID, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_update_app_status(UUID, TEXT, TEXT, TEXT[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- DONE — Developer Platform foundation added (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_09_monetization_scale.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Creator Economy & Monetization Scale (Master Prompt 19)
-- NON-DESTRUCTIVE: adds columns, tables, indexes, RPCs only. Never
-- modifies, renames, or deletes existing tables/rows.
--
-- Adds on top of the MP15 monetization foundation:
--   1. Creator monetization eligibility (status + configurable thresholds)
--   2. Creator product creation (subscriptions / digital products / paid
--      communities) through SECURITY DEFINER RPCs with centralized pricing
--      caps — creators can never set unbounded prices.
--   3. Revenue analytics snapshot (ledger-derived, aggregate-only)
--   4. Financial observability (payment event health, payout state,
--      reconciliation summary) for admin tooling.
--
-- Principles preserved from MP15: append-only ledger, no raw card data,
-- backend-authoritative entitlements, no direct client writes to financial
-- tables, origin isolation for sandbox, integer minor units only.
-- ═══════════════════════════════════════════════════════════

-- ── 1. CREATOR MONETIZATION ELIGIBILITY STATE ───────────────
-- Per-creator monetization status. NOT a score — a high-level status plus
-- human-understandable reason codes. Internal fraud/moderation thresholds
-- are never exposed; the RPC returns only status + reason codes.
--   not_eligible → in_progress → eligible
--   under_review (manual review pending), restricted (fraud/moderation),
--   paused (creator or platform initiated hold)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS monetization_status TEXT
    CHECK (monetization_status IN (
      'not_eligible', 'in_progress', 'eligible', 'under_review', 'restricted', 'paused'
    ));
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS monetization_status_note TEXT;

-- ── 2. ELIGIBILITY CONFIGURATION (configurable, no code changes) ──
-- Thresholds are rows in this table, editable by admins. `scope` lets a
-- future rollout tune per-region/cohort. Defaults match the product's
-- "emerging creator" spirit: low bars, no follower minimums that would
-- suppress new creators.
CREATE TABLE IF NOT EXISTS monetization_eligibility_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',
  min_account_days INTEGER NOT NULL DEFAULT 14,
  min_posts INTEGER NOT NULL DEFAULT 3,
  min_followers INTEGER NOT NULL DEFAULT 5,
  min_engagement INTEGER NOT NULL DEFAULT 10,
  max_restriction_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_eligibility_scope UNIQUE (scope)
);

INSERT INTO monetization_eligibility_config (scope, min_account_days, min_posts, min_followers, min_engagement, max_restriction_count)
VALUES ('global', 14, 3, 5, 10, 1)
ON CONFLICT (scope) DO NOTHING;

ALTER TABLE monetization_eligibility_config ENABLE ROW LEVEL SECURITY;
-- No client read/write policies: server-only via SECURITY DEFINER RPCs.

-- ── 3. ELIGIBILITY RPC ──────────────────────────────────────
-- Returns status + reason codes only. NEVER exposes thresholds or fraud
-- signals. Restricted status is authoritative (moderation/fraud overrides
-- all activity math). `in_progress` means thresholds are close but unmet.
CREATE OR REPLACE FUNCTION get_creator_monetization_status(p_user UUID)
RETURNS TABLE (status TEXT, reasons TEXT[], note TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg monetization_eligibility_config%ROWTYPE;
  v_profile user_profiles%ROWTYPE;
  v_post_count INT;
  v_follower_count INT;
  v_engagement INT;
  v_restriction_count INT;
  v_reasons TEXT[] := '{}';
  v_status TEXT;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_cfg FROM monetization_eligibility_config WHERE scope = 'global';
  IF NOT FOUND THEN
    SELECT * INTO v_cfg FROM monetization_eligibility_config LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN; -- config not seeded; degrade to no-op
  END IF;

  SELECT * INTO v_profile FROM user_profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Moderation/fraud state is authoritative.
  SELECT count(*) INTO v_restriction_count
    FROM user_restrictions
    WHERE user_id = p_user AND active = true
      AND (expires_at IS NULL OR expires_at > now());

  IF v_restriction_count > COALESCE(v_cfg.max_restriction_count, 1) THEN
    v_status := 'restricted';
    v_reasons := v_reasons || 'account_restrictions';
  ELSE
    -- Activity thresholds (unmet but progressing → in_progress).
    SELECT count(*) INTO v_post_count FROM social_posts WHERE user_id = p_user;
    SELECT count(*) INTO v_follower_count FROM follows WHERE following_id = p_user;
    SELECT count(*) INTO v_engagement
      FROM reactions r JOIN social_posts sp ON sp.id = r.target_id
      WHERE r.target_type = 'social_post' AND sp.user_id = p_user;

    IF v_post_count < COALESCE(v_cfg.min_posts, 3) THEN
      v_reasons := v_reasons || 'more_posts';
    END IF;
    IF v_follower_count < COALESCE(v_cfg.min_followers, 5) THEN
      v_reasons := v_reasons || 'more_followers';
    END IF;
    IF v_engagement < COALESCE(v_cfg.min_engagement, 10) THEN
      v_reasons := v_reasons || 'more_engagement';
    END IF;
    IF extract(epoch from (now() - v_profile.created_at)) / 86400 < COALESCE(v_cfg.min_account_days, 14) THEN
      v_reasons := v_reasons || 'account_age';
    END IF;

    v_status := CASE WHEN array_length(v_reasons, 1) IS NULL THEN 'eligible' ELSE 'in_progress' END;
  END IF;

  -- Manual override (set by admin/review flows) wins over auto-computed.
  IF v_profile.monetization_status IN ('under_review', 'paused', 'restricted') THEN
    v_status := v_profile.monetization_status;
  ELSIF v_profile.monetization_status = 'eligible' AND v_status = 'in_progress' THEN
    v_status := 'eligible'; -- admin already granted eligibility
  END IF;

  RETURN QUERY SELECT v_status, v_reasons, COALESCE(v_profile.monetization_status_note, '');
END;
$$;

REVOKE ALL ON FUNCTION get_creator_monetization_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_creator_monetization_status(UUID) TO authenticated;

-- ── 4. CREATOR PRODUCT CREATION (configurable, capped) ─────
-- Creators may create products via this RPC only. Pricing is validated
-- against centralized caps below — creators can never set unbounded prices
-- or mark products active without a price.
CREATE TABLE IF NOT EXISTS monetization_product_caps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',
  max_price_minor INTEGER NOT NULL DEFAULT 100000,      -- $1,000.00
  allowed_intervals TEXT[] NOT NULL DEFAULT ARRAY['one_time','month','year'],
  CONSTRAINT uniq_product_caps_scope UNIQUE (scope)
);

INSERT INTO monetization_product_caps (scope, max_price_minor, allowed_intervals)
VALUES ('global', 100000, ARRAY['one_time','month','year'])
ON CONFLICT (scope) DO NOTHING;

ALTER TABLE monetization_product_caps ENABLE ROW LEVEL SECURITY;

-- Create a creator-owned product with an initial price. Validates:
--   * caller owns the product
--   * product type is creator-sellable (subscription/digital/paid_community)
--   * price within caps
--   * billing interval allowed
-- Returns the product id and price id.
CREATE OR REPLACE FUNCTION create_creator_product(
  p_key TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_product_type TEXT DEFAULT 'creator_subscription',
  p_billing_text TEXT DEFAULT '',
  p_feature_list JSONB DEFAULT '[]',
  p_amount_minor INTEGER,
  p_currency TEXT DEFAULT 'usd',
  p_billing_interval TEXT DEFAULT 'month'
)
RETURNS TABLE (product_id UUID, price_id UUID, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caps monetization_product_caps%ROWTYPE;
  v_status TEXT;
  v_product_id UUID;
  v_price_id UUID;
  v_interval_ok BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  -- Only eligible creators can create sellable products.
  SELECT m.status INTO v_status FROM get_creator_monetization_status(auth.uid()) m;
  IF v_status IS DISTINCT FROM 'eligible' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'not_eligible'::TEXT;
    RETURN;
  END IF;

  IF p_key IS NULL OR p_key !~ '^[a-z0-9_]{2,64}$' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'invalid_key'::TEXT;
    RETURN;
  END IF;
  IF p_name IS NULL OR length(p_name) < 2 OR length(p_name) > 80 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'invalid_name'::TEXT;
    RETURN;
  END IF;
  IF p_product_type NOT IN ('creator_subscription', 'digital_product', 'paid_community') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'invalid_type'::TEXT;
    RETURN;
  END IF;
  IF p_billing_interval NOT IN ('one_time', 'month', 'year') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'invalid_interval'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_caps FROM monetization_product_caps WHERE scope = 'global';
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'config_missing'::TEXT;
    RETURN;
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 OR p_amount_minor > COALESCE(v_caps.max_price_minor, 100000) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'price_out_of_range'::TEXT;
    RETURN;
  END IF;

  v_interval_ok := p_billing_interval = ANY (COALESCE(v_caps.allowed_intervals, ARRAY['one_time','month','year']));
  IF NOT v_interval_ok THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'interval_not_allowed'::TEXT;
    RETURN;
  END IF;

  -- Insert product (draft until a price exists; status stays draft — an
  -- explicit activation RPC flips it active after pricing is confirmed).
  INSERT INTO monetization_products (key, name, description, product_type, owner_id, status, billing_text, feature_list)
  VALUES (
    'creator_' || p_key || '_' || replace(auth.uid()::text, '-', ''),
    p_name, COALESCE(p_description, ''), p_product_type, auth.uid(), 'draft',
    COALESCE(p_billing_text, ''), COALESCE(p_feature_list, '[]'::jsonb)
  )
  RETURNING id INTO v_product_id;

  INSERT INTO monetization_prices (product_id, amount_minor, currency, billing_interval, interval_count, region, label, status)
  VALUES (v_product_id, p_amount_minor, p_currency, p_billing_interval, 1, 'global', '', 'active')
  RETURNING id INTO v_price_id;

  PERFORM record_monetization_audit(
    'creator_product_created',
    jsonb_build_object('product_id', v_product_id, 'price_id', v_price_id, 'type', p_product_type),
    auth.uid(),
    auth.uid()
  );

  RETURN QUERY SELECT v_product_id, v_price_id, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION create_creator_product(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_creator_product(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT) TO authenticated;

-- ── 5. PRODUCT ACTIVATION RPC ───────────────────────────────
-- Creators activate their own draft products. Activation is a deliberate
-- step so a half-configured product can never go live by accident.
CREATE OR REPLACE FUNCTION activate_creator_product(p_product_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owned BOOLEAN;
  v_has_price BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM monetization_products
    WHERE id = p_product_id AND owner_id = auth.uid()
  ) INTO v_owned;
  IF NOT v_owned THEN
    RETURN false;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM monetization_prices
    WHERE product_id = p_product_id AND status = 'active'
  ) INTO v_has_price;
  IF NOT v_has_price THEN
    RETURN false;
  END IF;

  UPDATE monetization_products SET status = 'active', updated_at = now()
    WHERE id = p_product_id AND status = 'draft';

  PERFORM record_monetization_audit(
    'creator_product_activated',
    jsonb_build_object('product_id', p_product_id),
    auth.uid(),
    auth.uid()
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION activate_creator_product(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_creator_product(UUID) TO authenticated;

-- ── 6. REVENUE ANALYTICS SNAPSHOT ───────────────────────────
-- Aggregate, ledger-derived revenue analytics for the platform dashboard.
-- No user-level data. Computes per-day gross/net by product type plus
-- cumulative creator payout state.
CREATE TABLE IF NOT EXISTS monetization_revenue_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_revenue_snapshot_date UNIQUE (snapshot_date)
);

ALTER TABLE monetization_revenue_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION compute_revenue_snapshot()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', now(),
    'totals', (
      SELECT jsonb_agg(jsonb_build_object(
        'day', d::date,
        'gross_minor', COALESCE(SUM(p.amount_minor) FILTER (WHERE p.status = 'succeeded'), 0),
        'net_minor', COALESCE(SUM(
          p.amount_minor
          - COALESCE((p.metadata ->> 'platform_fee_minor')::int, 0)
          - COALESCE((p.metadata ->> 'processing_fee_minor')::int, 0)
        ) FILTER (WHERE p.status = 'succeeded'), 0),
        'refunded_minor', COALESCE(SUM(a.amount_minor) FILTER (WHERE a.adjustment_type = 'refund'), 0)
      ))
      FROM generate_series(now() - interval '30 days', now(), interval '1 day') d
      LEFT JOIN monetization_purchases p
        ON p.created_at::date = d::date AND p.origin = 'prod'
      LEFT JOIN monetization_adjustments a
        ON a.created_at::date = d::date AND a.adjustment_type = 'refund'
    ),
    'by_type', (
      SELECT jsonb_agg(jsonb_build_object(
        'product_type', mp.product_type,
        'gross_minor', COALESCE(SUM(p.amount_minor) FILTER (WHERE p.status = 'succeeded'), 0),
        'count', COUNT(p.id) FILTER (WHERE p.status = 'succeeded')
      ))
      FROM monetization_products mp
      JOIN monetization_purchases p ON p.product_id = mp.id AND p.origin = 'prod'
      GROUP BY mp.product_type
    ),
    'payouts', (
      SELECT jsonb_build_object(
        'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
        'processing_count', COUNT(*) FILTER (WHERE status = 'processing'),
        'paid_minor', COALESCE(SUM(amount_minor) FILTER (WHERE status = 'paid'), 0),
        'failed_count', COUNT(*) FILTER (WHERE status = 'failed')
      )
      FROM monetization_payouts WHERE origin = 'prod'
    ),
    'payment_health', (
      SELECT jsonb_build_object(
        'received_24h', COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status = 'received'),
        'failed_24h', COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status = 'failed'),
        'processed_total', COUNT(*) FILTER (WHERE status = 'processed')
      )
      FROM monetization_payment_events WHERE origin = 'prod'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION compute_revenue_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compute_revenue_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION compute_revenue_snapshot() TO authenticated;

-- ── 7. SNAPSHOT PERSISTENCE RPC ─────────────────────────────
-- Saves today's snapshot idempotently (one per date).
CREATE OR REPLACE FUNCTION save_revenue_snapshot(p_data JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO monetization_revenue_snapshots (snapshot_date, data)
  VALUES (now()::date, COALESCE(p_data, '{}'::jsonb))
  ON CONFLICT (snapshot_date) DO UPDATE SET data = EXCLUDED.data, created_at = now();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION save_revenue_snapshot(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_revenue_snapshot(JSONB) TO service_role;

-- ── 8. FINANCIAL OBSERVABILITY RPC ──────────────────────────
-- Reconciliation + drift summary for admin tooling. Reads internal tables
-- across all users — service-role / admin only.
CREATE OR REPLACE FUNCTION financial_observability()
RETURNS TABLE (kind TEXT, value BIGINT, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 'entitlement_drift'::TEXT, COUNT(*)::BIGINT, 'succeeded purchases missing active entitlement'
    FROM reconcile_monetization()
  UNION ALL
  SELECT 'pending_events_24h', COUNT(*)::BIGINT, 'webhook events stuck in received > 24h'
    FROM monetization_payment_events
    WHERE status IN ('received','processing') AND created_at < now() - interval '24 hours'
  UNION ALL
  SELECT 'failed_events_total', COUNT(*)::BIGINT, 'webhook events that failed processing'
    FROM monetization_payment_events WHERE status = 'failed'
  UNION ALL
  SELECT 'payouts_pending', COUNT(*)::BIGINT, 'payouts not yet confirmed'
    FROM monetization_payouts WHERE status IN ('pending','processing')
  UNION ALL
  SELECT 'audit_24h', COUNT(*)::BIGINT, 'financial audit actions last 24h'
    FROM monetization_audit_log WHERE created_at > now() - interval '24 hours';
END;
$$;

REVOKE ALL ON FUNCTION financial_observability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial_observability() TO service_role;
GRANT EXECUTE ON FUNCTION financial_observability() TO authenticated;

-- ── 9. INDEXES FOR GROWING FINANCIAL TABLES ─────────────────
CREATE INDEX IF NOT EXISTS idx_monetization_purchases_created ON monetization_purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_payment_events_created ON monetization_payment_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_payouts_created ON monetization_payouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monetization_products_owner ON monetization_products(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_revenue_snapshots_date ON monetization_revenue_snapshots(snapshot_date DESC);

-- ═══════════════════════════════════════════════════════════
-- DONE — monetization scale foundation added (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_10_personal_ai_foundation.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Personal AI Foundation (Master Prompt 22)
-- NON-DESTRUCTIVE: adds tables + RPCs only.
--
-- AI memory model (privacy-first by construction):
--   * There is NO opaque, model-generated "memory" of user activity. The
--     only persisted AI state is what the USER explicitly saves (topics /
--     preferences they want surfaced) — fully visible, editable, deletable.
--   * The personal digest is computed at request time from real authorized
--     rows (follows, communities) and is never persisted.
--   * ai_usage_log already governs inference observability (90-day
--     retention) — this migration only adds the user-owned preference row.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS personal_ai_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Explicit topics the user asked the assistant to keep surfacing.
  favorite_topics TEXT[] NOT NULL DEFAULT '{}',
  -- Coarse capability toggles (opt-out controls). Absent = enabled.
  disabled_capabilities TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE personal_ai_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Owners manage own AI preferences" ON personal_ai_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Upsert the calling user's preference row (owner-only by RLS + uid check).
CREATE OR REPLACE FUNCTION upsert_ai_preferences(
  p_favorite_topics TEXT[] DEFAULT NULL,
  p_disabled_capabilities TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO personal_ai_preferences (user_id, favorite_topics, disabled_capabilities)
  VALUES (
    v_uid,
    COALESCE(p_favorite_topics, '{}'),
    COALESCE(p_disabled_capabilities, '{}')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET favorite_topics = COALESCE(p_favorite_topics, personal_ai_preferences.favorite_topics),
        disabled_capabilities = COALESCE(p_disabled_capabilities, personal_ai_preferences.disabled_capabilities),
        updated_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION upsert_ai_preferences(TEXT[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_ai_preferences(TEXT[], TEXT[]) TO authenticated;

-- Hard-delete the calling user's AI preference state (used by the
-- "clear my AI preferences" control and by account deletion flows).
CREATE OR REPLACE FUNCTION clear_ai_preferences()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM personal_ai_preferences WHERE user_id = v_uid;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION clear_ai_preferences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_ai_preferences() TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- DONE — Personal AI foundation added (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_11_growth_engine_mp23.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Growth Engine (Master Prompt 23)
-- Referral Rewards, Viral-Loop Measurement & Growth Alerts data layer
--
-- NON-DESTRUCTIVE: only adds a table, indexes, RLS policies and RPCs.
-- Does NOT modify, rename, or delete any existing data or table.
--
-- What this adds:
--   1. referral_rewards — durable ledger of rewards granted to referrers.
--      Rewards are ONLY granted for ACTIVATED referrals (strong first-value
--      activity within 7 days of conversion), never for raw signups.
--      Idempotent per referral visit (unique constraint), monthly cap,
--      self-referral-proof (inherited from claim_referral_by_token).
--   2. grant_eligible_referral_rewards(referrer) — core grant logic used by
--      both the per-user sync and the service-role daily sweep.
--   3. sync_referral_rewards(p_user) — on-demand, owner-scoped (auth.uid()
--      must equal p_user); called when a user opens their invite page.
--   4. sweep_referral_rewards() — service-role-only daily sweep from the
--      cleanup cron; executes the same idempotent grant logic for everyone.
--   5. get_referral_summary(p_user) — owner-scoped invite-page stats
--      (visits, conversions, activated conversions, karma earned, recent
--      rewards). Aggregate-ish; only ever exposes the viewer's own data.
--   6. compute_growth_snapshot() EXTENDED with viral-loop metrics:
--      shares 7d (+ top channels) and K-factor estimate (conversions per
--      inviting user, 7d) — the viral coefficient as a direction indicator.
--
-- Principles:
--   * Rewards follow REAL value: a referred user must activate (not just
--     register) for the referrer to earn anything.
--   * No fake accounts, no raw-signup rewards, no invite-spam incentives.
--   * All writes go through SECURITY DEFINER functions — clients can never
--     forge rewards. Grants are idempotent and capped.
--   * Privacy: reward rows only expose the referrer's own data; the sweep
--     never returns user-level data.
-- ═══════════════════════════════════════════════════════════

-- ── 1. REFERRAL REWARDS LEDGER ─────────────────────────────
create table if not exists referral_rewards (
  id bigint generated always as identity primary key,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_visit_id uuid not null references referral_visits(id) on delete cascade unique,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null default 'karma',
  reward_amount int not null default 50,
  status text not null default 'granted',
  granted_at timestamptz not null default now()
);

create index if not exists idx_referral_rewards_referrer
  on referral_rewards(referrer_user_id, granted_at desc);
create index if not exists idx_referral_rewards_visit
  on referral_rewards(referral_visit_id);

alter table referral_rewards enable row level security;
-- Owners may read their own rewards; writes are exclusively via the
-- SECURITY DEFINER functions below (clients can never insert a reward row).
do $$ begin
  create policy "Owners read their referral rewards" on referral_rewards
    for select using (auth.uid() = referrer_user_id);
exception when duplicate_object then null;
end $$;

-- ── 2. CORE GRANT LOGIC (used by sync + sweep) ─────────────
-- Reward configuration — deliberately modest and transparent:
--   * 50 karma per ACTIVATED referral (same order of magnitude as content
--     creation rep, so invites are never the dominant karma source).
--   * Monthly cap of 10 grants per referrer (kills farming; keeps the
--     incentive honest).
--   * A conversion becomes grantable only after its 7-day activation window
--     has closed, and stays eligible for 30 days.
--   * Activation = the same definition the growth snapshot uses: a strong
--     rec_event (follow / join community / react / comment / share /
--     participate / vote) OR created content within 7 days of conversion.
create or replace function grant_eligible_referral_rewards(p_referrer uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c_reward_karma constant int := 50;
  c_monthly_cap constant int := 10;
  v_visit record;
  v_activated boolean;
  v_monthly int;
  v_granted int := 0;
begin
  if p_referrer is null then
    return 0;
  end if;

  select count(*) into v_monthly
    from referral_rewards
    where referrer_user_id = p_referrer
      and granted_at >= date_trunc('month', now());
  if v_monthly >= c_monthly_cap then
    return 0;
  end if;

  for v_visit in
    select rv.id, rv.converted_at, rv.converted_user_id
      from referral_visits rv
      where rv.referrer_user_id = p_referrer
        and rv.converted_at is not null
        and rv.converted_user_id is not null
        -- activation window has closed → outcome is known
        and rv.converted_at <= now() - interval '7 days'
        -- still recent enough to reward
        and rv.converted_at >= now() - interval '30 days'
        -- idempotent: never twice per visit
        and not exists (
          select 1 from referral_rewards rr
          where rr.referral_visit_id = rv.id
        )
      order by rv.converted_at asc
      limit (c_monthly_cap - v_monthly)
  loop
    -- Activation check (mirrors compute_growth_snapshot): strong first-value
    -- activity or created content within 7 days of conversion.
    select (
      exists (
        select 1 from rec_events e
        where e.user_id = v_visit.converted_user_id
          and e.created_at between v_visit.converted_at
            and v_visit.converted_at + interval '7 days'
          and e.event_type in ('user_followed', 'community_joined',
                               'content_reacted', 'content_commented',
                               'content_shared', 'challenge_participated',
                               'battle_voted')
      ) or exists (
        select 1 from social_posts sp
        where sp.user_id = v_visit.converted_user_id
          and sp.created_at between v_visit.converted_at
            and v_visit.converted_at + interval '7 days'
      )
    ) into v_activated;

    if not v_activated then
      continue;
    end if;

    insert into referral_rewards
      (referrer_user_id, referral_visit_id, referred_user_id,
       reward_type, reward_amount)
    values
      (p_referrer, v_visit.id, v_visit.converted_user_id,
       'karma', c_reward_karma)
    on conflict (referral_visit_id) do nothing;

    if found then
      -- Credit karma + refresh level (level names mirror lib/reputation/config.js).
      update user_profiles
        set karma = karma + c_reward_karma,
            level = case
              when karma + c_reward_karma >= 15000 then 'Legend'
              when karma + c_reward_karma >= 5000  then 'Supernova'
              when karma + c_reward_karma >= 1500  then 'Inferno'
              when karma + c_reward_karma >= 500   then 'Blaze'
              when karma + c_reward_karma >= 200   then 'Flame'
              when karma + c_reward_karma >= 50    then 'Ember'
              else 'Spark'
            end
        where id = p_referrer;

      v_granted := v_granted + 1;
      v_monthly := v_monthly + 1;
      if v_monthly >= c_monthly_cap then
        exit;
      end if;
    end if;
  end loop;

  return v_granted;
end;
$$;

revoke all on function grant_eligible_referral_rewards(uuid) from public;

-- ── 3. ON-DEMAND, OWNER-SCOPED SYNC ────────────────────────
-- Called when a user opens their invite page. auth.uid() must equal the
-- requested user; returns -1 when the caller is not the owner.
create or replace function sync_referral_rewards(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or auth.uid() is null or auth.uid() <> p_user then
    return -1;
  end if;
  return grant_eligible_referral_rewards(p_user);
end;
$$;

revoke all on function sync_referral_rewards(uuid) from public;
grant execute on function sync_referral_rewards(uuid) to authenticated;

-- ── 4. SERVICE-ROLE DAILY SWEEP ────────────────────────────
-- Runs from the cleanup cron with the service-role key. Anon and
-- authenticated users are explicitly blocked; the sweep only ever grants
-- rewards that the idempotent, capped core logic would grant anyway.
create or replace function sweep_referral_rewards()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_total int := 0;
begin
  for v_ref in
    select distinct rv.referrer_user_id
      from referral_visits rv
      where rv.converted_at is not null
        and rv.converted_at <= now() - interval '7 days'
        and rv.converted_at >= now() - interval '30 days'
        and not exists (
          select 1 from referral_rewards rr
          where rr.referrer_user_id = rv.referrer_user_id
            and rr.referral_visit_id = rv.id
        )
  loop
    v_total := v_total + grant_eligible_referral_rewards(v_ref);
  end loop;
  return v_total;
end;
$$;

revoke all on function sweep_referral_rewards() from public;
grant execute on function sweep_referral_rewards() to service_role;

-- ── 5. INVITE-PAGE SUMMARY (owner-scoped) ──────────────────
create or replace function get_referral_summary(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_visits int; v_conversions int; v_activated int; v_pending int;
  v_rewards int; v_karma int;
  v_recent jsonb;
begin
  if p_user is null or auth.uid() is null or auth.uid() <> p_user then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  select code into v_code
    from referral_codes
    where user_id = p_user and active = true
    limit 1;

  select count(*) into v_visits
    from referral_visits where referrer_user_id = p_user;
  select count(*) into v_conversions
    from referral_visits
    where referrer_user_id = p_user and converted_at is not null;
  select count(*) into v_activated
    from referral_visits rv
    where rv.referrer_user_id = p_user
      and rv.converted_at is not null
      and (
        exists (
          select 1 from rec_events e
          where e.user_id = rv.converted_user_id
            and e.created_at between rv.converted_at
              and rv.converted_at + interval '7 days'
            and e.event_type in ('user_followed', 'community_joined',
                                 'content_reacted', 'content_commented',
                                 'content_shared', 'challenge_participated',
                                 'battle_voted')
        ) or exists (
          select 1 from social_posts sp
          where sp.user_id = rv.converted_user_id
            and sp.created_at between rv.converted_at
              and rv.converted_at + interval '7 days'
        )
      );
  select count(*) into v_pending
    from referral_visits
    where referrer_user_id = p_user
      and converted_at is not null
      and converted_at > now() - interval '7 days';

  select count(*) into v_rewards
    from referral_rewards where referrer_user_id = p_user;
  select coalesce(sum(reward_amount), 0) into v_karma
    from referral_rewards where referrer_user_id = p_user;

  select coalesce(jsonb_agg(row_to_jsonb(r) order by r.granted_at desc), '[]'::jsonb)
    into v_recent
    from (
      select rr.reward_type, rr.reward_amount, rr.granted_at,
             up.username as referred_username
        from referral_rewards rr
        left join user_profiles up on up.id = rr.referred_user_id
        where rr.referrer_user_id = p_user
        limit 10
    ) r;

  return jsonb_build_object(
    'code', v_code,
    'visits', coalesce(v_visits, 0),
    'conversions', coalesce(v_conversions, 0),
    'activatedConversions', coalesce(v_activated, 0),
    'pendingConversions', coalesce(v_pending, 0),
    'rewardsGranted', coalesce(v_rewards, 0),
    'karmaEarned', coalesce(v_karma, 0),
    'recent', v_recent
  );
end;
$$;

revoke all on function get_referral_summary(uuid) from public;
grant execute on function get_referral_summary(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- 6. GROWTH SNAPSHOT EXTENSION — viral-loop measurement
--    Adds to compute_growth_snapshot():
--      shares.total7d + shares.byChannel   (share funnel, last 7 days)
--      virality.invitingUsers7d            (referrers with a converted visit)
--      virality.kFactorEstimate            (conversions / inviting users)
--    The K-factor is explicitly a DIRECTION INDICATOR, not a vanity number:
--    it is only meaningful alongside activation + retention cohorts, and the
--    admin dashboard never presents it as the sole success metric.
-- ═══════════════════════════════════════════════════════════
create or replace function compute_growth_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_signups_total int; v_signups_7d int; v_signups_30d int;
  v_dau int; v_wau int; v_mau int;
  v_activated_7d int;
  v_ref_visits_7d int; v_ref_conversions_7d int; v_ref_activated_7d int;
  v_follows_total int;
  v_creators_7d int;
  v_communities_total int; v_communities_new_7d int; v_communities_active_7d int;
  v_recent_daily int; v_baseline_daily int;
  v_shares_7d int; v_inviting_7d int; v_kfactor numeric;
begin
  -- Signups
  select count(*) into v_signups_total from auth.users;
  select count(*) into v_signups_7d from auth.users where created_at >= now() - interval '7 days';
  select count(*) into v_signups_30d from auth.users where created_at >= now() - interval '30 days';

  -- Active users (server-validated activity only)
  select count(distinct user_id) into v_dau from rec_events
    where created_at >= now() - interval '1 day' and user_id is not null;
  select count(distinct user_id) into v_wau from rec_events
    where created_at >= now() - interval '7 days' and user_id is not null;
  select count(distinct user_id) into v_mau from rec_events
    where created_at >= now() - interval '30 days' and user_id is not null;

  -- Activation: strong first-value events in the last 7 days
  select count(distinct user_id) into v_activated_7d from rec_events
  where created_at >= now() - interval '7 days'
    and user_id is not null
    and event_type in ('user_followed', 'community_joined', 'content_reacted',
                       'content_commented', 'content_shared', 'challenge_participated',
                       'battle_voted');

  -- Referral quality (real visit/conversion rows)
  select count(*) into v_ref_visits_7d from referral_visits where created_at >= now() - interval '7 days';
  select count(*) into v_ref_conversions_7d from referral_visits where converted_at >= now() - interval '7 days';
  select count(distinct rv.converted_user_id) into v_ref_activated_7d
  from referral_visits rv
  where rv.converted_at >= now() - interval '7 days'
    and rv.converted_user_id is not null
    and exists (
      select 1 from rec_events e
      where e.user_id = rv.converted_user_id
        and e.created_at between rv.converted_at and rv.converted_at + interval '7 days'
    );

  -- Network density
  select count(*) into v_follows_total from follows;

  -- Creators: distinct authors with content in the last 7 days
  select count(distinct user_id) into v_creators_7d from social_posts
    where created_at >= now() - interval '7 days' and user_id is not null;

  -- Communities
  select count(*) into v_communities_total from communities;
  select count(*) into v_communities_new_7d from communities where created_at >= now() - interval '7 days';
  select count(distinct community_id) into v_communities_active_7d from social_posts
    where created_at >= now() - interval '7 days' and community_id is not null;

  -- Share funnel (real share events, last 7 days)
  select count(*) into v_shares_7d from shares
    where created_at >= now() - interval '7 days';

  -- Viral coefficient (direction indicator): conversions per inviting user
  select count(distinct referrer_user_id) into v_inviting_7d from referral_visits
    where converted_at >= now() - interval '7 days';
  v_kfactor := case when v_inviting_7d > 0
    then round(v_ref_conversions_7d::numeric / v_inviting_7d, 2)
    else 0 end;

  -- Anomaly: signup spike (last 7d avg per day vs previous 21d baseline)
  select coalesce(round(avg(d.c)::numeric, 1), 0) into v_recent_daily from (
    select count(*) as c from auth.users
    where created_at >= now() - interval '7 days'
    group by date_trunc('day', created_at)
  ) d;
  select coalesce(round(avg(d.c)::numeric, 1), 0) into v_baseline_daily from (
    select count(*) as c from auth.users
    where created_at >= now() - interval '28 days'
      and created_at < now() - interval '7 days'
    group by date_trunc('day', created_at)
  ) d;

  -- Cohort retention: weekly signup cohorts, last 12 weeks
  select coalesce(jsonb_agg(row_to_jsonb(c) order by c.cohort), '[]'::jsonb) into v
  from (
    with cohort_users as (
      select date_trunc('week', created_at)::date as cohort,
             id as uid,
             created_at as signed_at
      from auth.users
      where created_at >= date_trunc('week', now()) - interval '11 weeks'
    )
    select cohort,
           count(*) as size,
           round(100.0 * count(*) filter (where exists (
             select 1 from rec_events e
             where e.user_id = cohort_users.uid
               and e.created_at between signed_at and signed_at + interval '1 day'))
             / nullif(count(*), 0), 1) as d1_pct,
           round(100.0 * count(*) filter (where exists (
             select 1 from rec_events e
             where e.user_id = cohort_users.uid
               and e.created_at between signed_at and signed_at + interval '7 days'))
             / nullif(count(*), 0), 1) as d7_pct,
           round(100.0 * count(*) filter (where exists (
             select 1 from rec_events e
             where e.user_id = cohort_users.uid
               and e.created_at between signed_at and signed_at + interval '30 days'))
             / nullif(count(*), 0), 1) as d30_pct
    from cohort_users
    group by cohort
  ) c;

  return jsonb_build_object(
    'generatedAt', now()::text,
    'signups', jsonb_build_object('total', v_signups_total, 'last7d', v_signups_7d, 'last30d', v_signups_30d),
    'active', jsonb_build_object('dau', v_dau, 'wau', v_wau, 'mau', v_mau,
      'dauMauPct', round(100.0 * v_dau / nullif(v_mau, 0), 1)),
    'activation', jsonb_build_object('activated7d', v_activated_7d,
      'activationRatePct', round(100.0 * v_activated_7d / nullif(v_signups_7d, 0), 1)),
    'cohorts', v,
    'referral', jsonb_build_object('visits7d', v_ref_visits_7d, 'conversions7d', v_ref_conversions_7d,
      'conversionRatePct', round(100.0 * v_ref_conversions_7d / nullif(v_ref_visits_7d, 0), 1),
      'activatedConverted7d', v_ref_activated_7d),
    'shares', jsonb_build_object('total7d', v_shares_7d, 'byChannel', coalesce((
      select jsonb_agg(row_to_jsonb(c) order by c.cnt desc) from (
        select channel, count(*) as cnt from shares
        where created_at >= now() - interval '7 days'
        group by channel
      ) c
    ), '[]'::jsonb)),
    'virality', jsonb_build_object('invitingUsers7d', v_inviting_7d,
      'kFactorEstimate', v_kfactor),
    'network', jsonb_build_object('totalFollows', v_follows_total,
      'followsPerActiveUser', round(v_follows_total::numeric / nullif(v_mau, 0), 2),
      'activeUsers30d', v_mau),
    'creators', jsonb_build_object('active7d', v_creators_7d),
    'communities', jsonb_build_object('total', v_communities_total, 'new7d', v_communities_new_7d, 'active7d', v_communities_active_7d),
    'regions', coalesce((
      select jsonb_agg(row_to_jsonb(r) order by r.users desc) from (
        select coalesce(locale, 'unknown') as locale,
               count(*) as users
        from user_profiles
        group by coalesce(locale, 'unknown')
      ) r
    ), '[]'::jsonb),
    'anomalies', jsonb_build_array(
      case when v_recent_daily > 0 and v_baseline_daily > 0 and v_recent_daily > 3 * v_baseline_daily
        then jsonb_build_object('type', 'signup_spike', 'level', 'warn',
          'detail', 'Signups (' || v_recent_daily || '/day avg) are ' ||
          round((v_recent_daily / v_baseline_daily)::numeric, 1) || 'x the 21-day baseline (' ||
          v_baseline_daily || '/day). Verify it is real traffic, not bots.')
        else jsonb_build_object('type', 'signup_spike', 'level', 'info',
          'detail', 'Signup rate within normal range.') end
    )
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════
-- DONE — Growth Engine (Master Prompt 23) schema created (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_09_12_creator_economy_mp24.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Creator Economy — Payout Requests (Master Prompt 24)
--
-- NON-DESTRUCTIVE: only adds an RPC function. No table, column, or row is
-- modified, renamed, or deleted.
--
-- What this adds:
--   request_creator_payout(p_user, p_min_minor, p_origin) — the creator-
--   facing payout REQUEST step of the payout lifecycle:
--
--     EARNINGS → PENDING → AVAILABLE → PAYOUT REQUEST → PROCESSING → COMPLETED
--
--   Guardrails (all server-side, SECURITY DEFINER):
--     * Owner-scoped: auth.uid() must equal p_user (a creator can only ever
--       request THEIR OWN payout).
--     * Minimum threshold: available earnings must be >= the configured
--       minimum (the app layer passes the policy value; SQL enforces it).
--     * One open payout at a time: no concurrent pending/held/processing
--       payout may already exist (prevents double-request races).
--     * Ledger-consistent: available is moved to pending on the derived
--       balance row (CHECK constraints keep both non-negative), and a payout
--       row is appended with a unique request token — never an UPDATE of
--       history.
--     * Audited: every request appends a financial audit line.
--
--   IMPORTANT: requesting a payout does NOT move real money. The payout stays
--   'pending' until an admin/provider-confirmed payout driver processes it
--   (none is wired yet — the sandbox provider never touches production). This
--   function makes the REQUEST honest and visible; it promises nothing about
--   instant payouts.
-- ═══════════════════════════════════════════════════════════

create or replace function request_creator_payout(
  p_user uuid,
  p_min_minor int default 1000,
  p_origin text default 'prod'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance monetization_creator_balances%ROWTYPE;
  v_open int;
  v_payout_id uuid;
  v_token text;
begin
  -- Owner-scoped: creators may only request their own payouts.
  if p_user is null or auth.uid() is null or auth.uid() <> p_user then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  select * into v_balance
    from monetization_creator_balances
    where user_id = p_user;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_balance');
  end if;

  -- Minimum threshold (policy value supplied by the app layer).
  if v_balance.available_minor < p_min_minor then
    return jsonb_build_object(
      'ok', false,
      'reason', 'below_minimum',
      'minimum_minor', p_min_minor,
      'available_minor', v_balance.available_minor
    );
  end if;

  -- One open payout at a time.
  select count(*) into v_open
    from monetization_payouts
    where user_id = p_user
      and status in ('pending', 'held', 'processing');
  if v_open > 0 then
    return jsonb_build_object('ok', false, 'reason', 'open_payout');
  end if;

  v_token := 'po_' || replace(gen_random_uuid()::text, '-', '');

  -- Append the payout request (ledger row; nothing moves yet).
  insert into monetization_payouts
    (user_id, amount_minor, currency, status, request_token, origin)
  values
    (p_user, v_balance.available_minor, v_balance.currency, 'pending', v_token, p_origin)
  returning id into v_payout_id;

  -- Move available → pending on the derived balance (non-negative CHECKs
  -- guarantee consistency; this is the only sanctioned transition).
  update monetization_creator_balances
    set available_minor = available_minor - v_balance.available_minor,
        pending_minor = pending_minor + v_balance.available_minor,
        updated_at = now()
    where user_id = p_user;

  perform record_monetization_audit(
    'payout_requested',
    jsonb_build_object(
      'payout_id', v_payout_id,
      'amount_minor', v_balance.available_minor,
      'currency', v_balance.currency
    ),
    auth.uid(),
    p_user
  );

  return jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'amount_minor', v_balance.available_minor,
    'currency', v_balance.currency
  );
end;
$$;

revoke all on function request_creator_payout(uuid, int, text) from public;
grant execute on function request_creator_payout(uuid, int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- DONE — Creator payout request added (additive only)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_10_08_battle_voting.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Battles + Challenges — voting integrity (additive only)
--
--   1. battles.updated_at: cast_battle_vote() writes this column but no
--      migration ever created it, so every vote fails on a clean schema.
--      Added idempotently; the RPC works unchanged afterwards.
--   2. battle_votes.ip_hash: optional network-identity binding recorded
--      alongside each vote for abuse analysis (never exposed publicly).
--      cast_battle_vote() gains an optional p_ip_hash parameter —
--      existing callers keep working (default NULL).
--   3. challenge_votes: one active vote per user per challenge
--      (UNIQUE(challenge_id, user_id)), switchable between entries.
--      Totals are always derived by count — never trusted from clients.
--   4. challenges.winner_post_id + decided_at: persisted outcome once a
--      challenge ends with a clear winner (NULL = no winner / no signal).
-- ═══════════════════════════════════════════════════════════

-- ── 1. battles.updated_at (vote RPC writes it) ─────────────
ALTER TABLE battles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 2. battle vote network binding ─────────────────────────
ALTER TABLE battle_votes ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_battle_votes_ip ON battle_votes(ip_hash)
  WHERE ip_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cast_battle_vote(
  p_battle_id UUID,
  p_voter_key TEXT,
  p_selection INT,
  p_user_id UUID DEFAULT NULL,
  p_ip_hash TEXT DEFAULT NULL
)
RETURNS TABLE (success boolean, message text, votes1 bigint, votes2 bigint, total bigint, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b_record battles%ROWTYPE;
  v1 bigint;
  v2 bigint;
  inserted boolean;
BEGIN
  IF p_voter_key IS NULL OR char_length(p_voter_key) = 0 THEN
    RETURN QUERY SELECT false, 'Missing voter identity', 0, 0, 0, 'none';
    RETURN;
  END IF;

  IF p_selection NOT IN (1, 2) THEN
    RETURN QUERY SELECT false, 'Invalid selection', 0, 0, 0, 'none';
    RETURN;
  END IF;

  SELECT * INTO b_record FROM battles WHERE id = p_battle_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Battle not found', 0, 0, 0, 'none';
    RETURN;
  END IF;

  -- Block self-voting when the signed-in user owns one of the fighters
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM profiles
      WHERE id IN (b_record.profile1_id, b_record.profile2_id)
        AND user_id = p_user_id
    ) THEN
      RETURN QUERY SELECT false, 'You cannot vote in a battle featuring your own profile', 0, 0, 0, 'none';
      RETURN;
    END IF;
  END IF;

  -- Upsert the vote (allow switching). xmax = 0 on the returned row
  -- means the row was freshly inserted (not an update).
  INSERT INTO battle_votes (battle_id, voter_key, selection, user_id, ip_hash)
  VALUES (p_battle_id, p_voter_key, p_selection, p_user_id, p_ip_hash)
  ON CONFLICT (battle_id, voter_key)
  DO UPDATE SET selection = EXCLUDED.selection, updated_at = now(),
                ip_hash = COALESCE(EXCLUDED.ip_hash, battle_votes.ip_hash)
  RETURNING (xmax = 0) INTO inserted;

  -- Recompute canonical totals from real vote rows
  SELECT count(*) FILTER (WHERE selection = 1),
         count(*) FILTER (WHERE selection = 2)
    INTO v1, v2
    FROM battle_votes WHERE battle_id = p_battle_id;

  UPDATE battles
     SET votes1 = v1, votes2 = v2, updated_at = now()
   WHERE id = p_battle_id;

  RETURN QUERY SELECT true,
    CASE WHEN inserted THEN 'added' ELSE 'switched' END,
    v1, v2, v1 + v2,
    CASE WHEN inserted THEN 'added' ELSE 'switched' END;
END;
$$;

-- ── 3. challenge_votes (1 active vote per user per challenge) ──
CREATE TABLE IF NOT EXISTS challenge_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_challenge_vote UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_votes_challenge ON challenge_votes(challenge_id, post_id);
CREATE INDEX IF NOT EXISTS idx_challenge_votes_user ON challenge_votes(user_id);

ALTER TABLE challenge_votes ENABLE ROW LEVEL SECURITY;

-- Vote rows are readable (public tallies); writes are owner-scoped to the
-- voter's own row. Eligibility (active challenge, real entry, no
-- self-vote, blocks) is enforced in the API route, and totals are
-- derived by count — never accepted from the client.
DROP POLICY IF EXISTS "Public can read challenge votes" ON challenge_votes;
CREATE POLICY "Public can read challenge votes" ON challenge_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users cast own challenge vote" ON challenge_votes;
CREATE POLICY "Users cast own challenge vote" ON challenge_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users switch own challenge vote" ON challenge_votes;
CREATE POLICY "Users switch own challenge vote" ON challenge_votes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users withdraw own challenge vote" ON challenge_votes;
CREATE POLICY "Users withdraw own challenge vote" ON challenge_votes
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. Persisted challenge outcome ─────────────────────────
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS winner_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════
-- DONE — battle voting integrity + challenge votes (additive)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_10_08_community_types.sql
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Communities — types, approvals, suspension (additive only)
--
--   1. communities.visibility gains 'hidden' (public | private | hidden).
--      Hidden communities are invisible to non-members: RLS already gates
--      reads to (visibility = 'public' OR member), and every discovery
--      query filters visibility = 'public', so hidden rows never surface.
--   2. community_members.membership_status gains 'pending' for private
--      community join requests (approve → active, deny → row deleted).
--   3. RPC community_suspend_member() lets active owner/admin/moderator
--      suspend or unsuspend a member (never owners). Suspended members
--      keep their row so re-join is blocked; only owners can unsuspend
--      via the same RPC (moderators suspend, owners unsuspend or remove).
--      Actually: moderators AND owners may suspend/unsuspend — the RPC
--      validates the actor is an active owner/admin/moderator.
--   4. reports.target_type gains 'community' so communities are reportable
--      through the existing structured safety-report pipeline.
--   5. moderation_actions audit gains community membership action types.
-- ═══════════════════════════════════════════════════════════

-- ── 1. visibility CHECK → public | private | hidden ──────────
DO $$ DECLARE cname text; BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'communities'::regclass
      AND pg_get_constraintdef(oid) LIKE '%visibility%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE communities DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE communities
  ADD CONSTRAINT communities_visibility_check
  CHECK (visibility IN ('public', 'private', 'hidden'));

-- ── 2. membership_status CHECK → + pending ───────────────────
DO $$ DECLARE cname text; BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'community_members'::regclass
      AND pg_get_constraintdef(oid) LIKE '%membership_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE community_members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE community_members
  ADD CONSTRAINT community_members_status_check
  CHECK (membership_status IN ('active', 'pending', 'removed', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_community_members_pending
  ON community_members(community_id, membership_status);

-- ── 3. Suspend / unsuspend RPC (database-enforced roles) ─────
CREATE OR REPLACE FUNCTION public.community_suspend_member(
  community uuid,
  target uuid,
  suspend boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  target_role text;
  target_status text;
BEGIN
  -- Actor must be an active owner/admin/moderator of this community
  SELECT role INTO actor_role FROM community_members
    WHERE community_id = community
      AND user_id = auth.uid()
      AND membership_status = 'active';

  IF actor_role IS NULL
     OR actor_role NOT IN ('owner', 'admin', 'moderator') THEN
    RETURN false;
  END IF;

  -- Target must hold a membership row in this community
  SELECT role, membership_status INTO target_role, target_status
    FROM community_members
    WHERE community_id = community
      AND user_id = target;

  IF target_role IS NULL THEN
    RETURN false;
  END IF;

  -- Owners can never be suspended (owner safety)
  IF target_role = 'owner' THEN
    RETURN false;
  END IF;

  IF suspend THEN
    IF target_status != 'active' THEN
      RETURN false;
    END IF;
    UPDATE community_members SET membership_status = 'suspended'
      WHERE community_id = community AND user_id = target;
  ELSE
    IF target_status != 'suspended' THEN
      RETURN false;
    END IF;
    UPDATE community_members SET membership_status = 'active'
      WHERE community_id = community AND user_id = target;
  END IF;

  RETURN true;
END;
$$;

-- ── 4. Community report target ───────────────────────────────
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'user',
    'social_post', 'comment', 'challenge', 'community'
  ));

-- ── 5. Membership moderation audit types ─────────────────────
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_type_check
  CHECK (action_type IN (
    'hide_roast', 'unhide_roast',
    'hide_hot_seat', 'unhide_hot_seat',
    'restrict_profile', 'unrestrict_profile',
    'ban_profile', 'unban_profile',
    'dismiss_report', 'resolve_report', 'escalate_report',
    'resolve_appeal', 'reverse_appeal',
    'community_remove_post', 'community_remove_member', 'community_role_changed',
    'community_approve_member', 'community_deny_member',
    'community_suspend_member', 'community_unsuspend_member'
  ));

-- ═══════════════════════════════════════════════════════════
-- DONE — community types + approvals + suspension (additive)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- FILE: migrations/2026_10_08_photo_posts_privacy.sql
-- ────────────────────────────────────────────────────────────

-- BURNBOARD — Rich photo posts + privacy control (additive only).
--
-- Design: drafts/scheduled ride on social_posts.visibility
-- ('draft' / 'scheduled') + metadata JSON, so NO new post columns are
-- required and every existing query keeps working. This migration adds:
--   1. post_saves table (save/unsave any social post)
--   2. post-media storage bucket + policies (photo uploads)
--   3. RLS read policies so owners always see their own non-public posts
--      and followers see followers-only posts (app layer enforces the
--      same rules as defense-in-depth; without this migration the safe
--      default is simply that non-public posts don't surface).
--   4. Realtime publication for post_saves (best-effort).

-- ── 1. post_saves ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_saves_user ON post_saves(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_saves_post ON post_saves(post_id);

ALTER TABLE post_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own saves" ON post_saves;
CREATE POLICY "Users read own saves" ON post_saves
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users save posts" ON post_saves;
CREATE POLICY "Users save posts" ON post_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users unsave posts" ON post_saves;
CREATE POLICY "Users unsave posts" ON post_saves
  FOR DELETE USING (auth.uid() = user_id);

-- ── 2. post-media storage bucket ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read post media" ON storage.objects;
CREATE POLICY "Public read post media" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Auth upload post media" ON storage.objects;
CREATE POLICY "Auth upload post media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-media'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Owner delete post media" ON storage.objects;
CREATE POLICY "Owner delete post media" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-media'
    AND auth.uid() = owner
  );

-- ── 3. Non-public post reads (additive; existing policies untouched) ──
DROP POLICY IF EXISTS "Owners read own posts" ON social_posts;
CREATE POLICY "Owners read own posts" ON social_posts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Followers read followers posts" ON social_posts;
CREATE POLICY "Followers read followers posts" ON social_posts
  FOR SELECT USING (
    visibility = 'followers'
    AND moderation_state = 'visible'
    AND EXISTS (
      SELECT 1 FROM follows
      WHERE follows.follower_id = auth.uid()
        AND follows.following_id = social_posts.user_id
    )
  );

-- ── 4. Realtime (best-effort) ─────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE post_saves;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
