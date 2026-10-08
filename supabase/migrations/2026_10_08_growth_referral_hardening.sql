-- BURNBOARD Growth — referral hardening + share type expansion
-- NON-DESTRUCTIVE, additive only. No existing rows modified.

-- ── 1. shares.resource_id: UUID → TEXT (existing UUIDs stay valid text) ──
-- Enables hashtag shares (tag string as resource_id) alongside real row ids.
DO $$ BEGIN
  ALTER TABLE shares ALTER COLUMN resource_id TYPE TEXT USING resource_id::text;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Expand shareable resource types: photo (public photo post) + hashtag.
ALTER TABLE shares DROP CONSTRAINT IF EXISTS shares_resource_type_check;
ALTER TABLE shares ADD CONSTRAINT shares_resource_type_check
  CHECK (resource_type IN (
    'social_post', 'photo', 'roast', 'profile', 'community',
    'challenge', 'battle', 'topic', 'hashtag'
  ));

-- ── 2. Harden claim_referral_by_token ──────────────────────────
-- Guards (all server-side, all auditable by the visits table itself):
--   - self-referrals never convert (kept)
--   - each visit converts once (kept)
--   - each USER converts once ever (NEW: no duplicate-user attribution,
--     no referral farming across multiple invites)
--   - pre-existing accounts never convert (NEW: the account must have been
--     created after the visit, with a 1h grace for clock/signup skew —
--     shared devices/households with genuinely new accounts still work)
CREATE OR REPLACE FUNCTION claim_referral_by_token(p_token UUID, p_user UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_referrer UUID;
  v_visit_created TIMESTAMPTZ;
  v_prior_conversions INT;
  v_account_created TIMESTAMPTZ;
BEGIN
  IF p_token IS NULL OR p_user IS NULL OR auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT code, referrer_user_id, created_at INTO v_code, v_referrer, v_visit_created
    FROM referral_visits
    WHERE id = p_token AND converted_at IS NULL
    LIMIT 1;

  IF v_code IS NULL OR v_referrer IS NULL OR v_referrer = p_user THEN
    RETURN NULL;
  END IF;

  -- One conversion per user, ever.
  SELECT count(*) INTO v_prior_conversions FROM referral_visits
    WHERE converted_user_id = p_user AND converted_at IS NOT NULL;
  IF v_prior_conversions > 0 THEN
    RETURN NULL;
  END IF;

  -- The account must be newer than the visit (pre-existing users are not
  -- referrals). Fail-open when the profile row is not yet visible.
  SELECT created_at INTO v_account_created FROM user_profiles
    WHERE id = p_user LIMIT 1;
  IF v_account_created IS NOT NULL AND v_visit_created IS NOT NULL
     AND v_account_created < (v_visit_created - interval '1 hour') THEN
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

CREATE INDEX IF NOT EXISTS idx_referral_visits_converted_user
  ON referral_visits(converted_user_id) WHERE converted_user_id IS NOT NULL;
