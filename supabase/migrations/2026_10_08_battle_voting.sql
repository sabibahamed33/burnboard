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
