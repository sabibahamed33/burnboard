-- ═══════════════════════════════════════════════════════════
-- BURNBOARD Direct Messages — requests, read state, shares (additive)
--
-- Builds on the existing dm_threads / dm_messages tables (006):
--   1. dm_threads.status: 'active' | 'requested' (message request
--      awaiting the recipient) + requested_by. Legacy rows default to
--      'active' — no behavior change for existing conversations.
--   2. dm_messages widened to 500 chars (relaxes the legacy 280 check),
--      plus is_read / read_at (recipient read state), reply_to_id
--      (reply thread), attachment_url + attachment_type (photo shares),
--      shared_ref JSONB (post/profile/battle/challenge/community refs).
--   3. Sender delete (delete-for-everyone by the author) + participant
--      read-receipt updates via new RLS policies (all additive).
--   4. user_profiles.dm_privacy: 'everyone' | 'follows' | 'none'
--      (who may start new conversations with you) + dm_alerts toggle.
--   5. reports.target_type gains 'dm_message' so abusive messages are
--      reportable through the existing structured safety pipeline.
--   6. dm_threads added to the realtime publication (dm_messages was
--      already there) for conversation-list bumps.
-- ═══════════════════════════════════════════════════════════

-- ── 1. Thread request state ────────────────────────────────
ALTER TABLE dm_threads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE dm_threads ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE dm_threads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT now();

DO $$ DECLARE cname text; BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'dm_threads'::regclass
      AND pg_get_constraintdef(oid) LIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE dm_threads DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE dm_threads
  ADD CONSTRAINT dm_threads_status_check
  CHECK (status IN ('active', 'requested'));

CREATE INDEX IF NOT EXISTS idx_dm_threads_status ON dm_threads(status, updated_at DESC);

-- ── 2. Message capabilities ────────────────────────────────
-- Relax legacy length checks (280 and 500 variants) to one 500 check.
DO $$ DECLARE cname text; BEGIN
  FOR cname IN
    SELECT conname FROM pg_constraint
      WHERE conrelid = 'dm_messages'::regclass
        AND pg_get_constraintdef(oid) LIKE '%char_length(message)%'
  LOOP
    EXECUTE format('ALTER TABLE dm_messages DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE dm_messages
  ADD CONSTRAINT dm_messages_message_check
  CHECK (char_length(message) <= 500);

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS shared_ref JSONB;

CREATE INDEX IF NOT EXISTS idx_dm_messages_unread ON dm_messages(thread_id, is_read, created_at DESC)
  WHERE is_read = false;

DO $$ BEGIN
  CREATE POLICY "Senders delete own messages" ON dm_messages
    FOR DELETE USING (auth.uid() = sender_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Participants mark messages read" ON dm_messages
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM dm_threads
        WHERE dm_threads.id = dm_messages.thread_id
          AND (auth.uid() = dm_threads.user1_id OR auth.uid() = dm_threads.user2_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Participants may delete their own threads (declined requests, cleanup).
-- Messages cascade. Enforcement of who-may-delete-what stays app-side.
DO $$ BEGIN
  CREATE POLICY "Participants delete own threads" ON dm_threads
    FOR DELETE USING (auth.uid() = user1_id OR auth.uid() = user2_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Recipient messaging privacy ─────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dm_privacy TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dm_alerts BOOLEAN NOT NULL DEFAULT true;

DO $$ DECLARE cname text; BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'user_profiles'::regclass
      AND pg_get_constraintdef(oid) LIKE '%dm_privacy%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_dm_privacy_check
  CHECK (dm_privacy IN ('everyone', 'follows', 'none'));

-- ── 4. Reportable DM content ───────────────────────────────
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN (
    'roast', 'hot_seat', 'battle', 'profile', 'user',
    'social_post', 'comment', 'challenge', 'community', 'dm_message'
  ));

-- ── 5. Realtime for thread list bumps ──────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE dm_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE — DM requests + read state + shares + privacy (additive)
-- ═══════════════════════════════════════════════════════════
