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
