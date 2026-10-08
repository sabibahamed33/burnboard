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
