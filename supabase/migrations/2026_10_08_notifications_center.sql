-- BURNBOARD Notifications — Activity Center columns (additive only)
--
-- Adds priority / category / metadata to notifications and backfills them
-- from the existing type taxonomy (derived values, no fabrication).
-- Adds the missing owner-scoped DELETE policy (clear/delete endpoints).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'social';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- Backfill from the real type taxonomy (HIGH=2, MEDIUM=1, LOW=0).
UPDATE notifications SET
  priority = CASE
    WHEN type IN ('dm', 'safety_notice', 'battle_result', 'billing') THEN 2
    WHEN type IN ('comment', 'reply', 'mention', 'follow',
                  'community_joined', 'community_role_changed',
                  'community_join_request', 'community_join_approved',
                  'battle_invite', 'battle_ready',
                  'challenge_invite', 'challenge_result') THEN 1
    ELSE 0
  END,
  category = CASE
    WHEN type = 'mention' THEN 'mentions'
    WHEN type IN ('follow', 'comment', 'reply', 'reaction_activity',
                  'new_roast', 'burn_score_milestone', 'leaderboard_entry',
                  'weekly_recap') THEN 'social'
    WHEN type LIKE 'community_%' THEN 'communities'
    WHEN type LIKE 'battle_%' THEN 'battles'
    WHEN type LIKE 'challenge_%' THEN 'challenges'
    WHEN type IN ('level_up', 'achievement_unlocked', 'milestone') THEN 'achievements'
    WHEN type = 'dm' THEN 'messages'
    WHEN type IN ('safety_notice', 'billing') THEN 'system'
    ELSE 'social'
  END
WHERE priority = 0 AND category = 'social';

CREATE INDEX IF NOT EXISTS idx_notifications_user_cat
  ON notifications(user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_smart
  ON notifications(user_id, priority DESC, created_at DESC)
  WHERE is_read = false;

-- Owner-scoped delete (clear read history / remove single items).
DO $$ BEGIN
  CREATE POLICY "Users delete own notifications" ON notifications
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
