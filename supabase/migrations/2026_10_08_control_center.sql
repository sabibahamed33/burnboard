-- BURNBOARD Control Center — RBAC, audit log, incidents (additive only)
-- Internal privileged roles. These are NOT public account types: every
-- public account remains a USER. Roles are granted by operators in SQL;
-- no self-service promotion path exists anywhere in the app.

-- ── 1. STAFF ROLES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'super_admin', 'admin', 'safety_lead', 'moderator',
    'support', 'analyst', 'operations'
  )),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;
-- No direct client access at all: reads/writes flow through definer RPCs.
-- (RLS enabled with zero policies = deny by default.)

-- Own roles (every signed-in user may ask who THEY are operationally).
CREATE OR REPLACE FUNCTION public.my_staff_roles()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT array_agg(sr.role) FROM staff_roles sr WHERE sr.user_id = auth.uid()),
    '{}'
  ) || COALESCE(
    (SELECT array_agg(f.flag) FROM (
      SELECT 'admin' AS flag FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
      UNION ALL
      SELECT 'moderator' AS flag FROM user_profiles
      WHERE id = auth.uid() AND (is_moderator = true OR is_admin = true)
    ) f),
    '{}'
  );
$$;

-- Role check for server-side enforcement (never expose other users' roles).
CREATE OR REPLACE FUNCTION public.has_staff_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(public.my_staff_roles()) r WHERE r = ANY (p_roles)
  );
$$;

-- ── 2. ADMIN AUDIT LOG (append-only, deny-all RLS) ────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role_used TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL DEFAULT 'ok',
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log(action, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Deny-all: reads go through the staff-gated RPC below; writes through
-- log_admin_action only. No UPDATE/DELETE path exists.

-- Staff-only append (role recorded server-side from the caller's roles).
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_result TEXT DEFAULT 'ok',
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roles TEXT[];
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  v_roles := public.my_staff_roles();
  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO admin_audit_log (actor_id, role_used, action, target_type, target_id, result, reason, metadata)
  VALUES (auth.uid(), v_roles[1], p_action, p_target_type, p_target_id, p_result, p_reason, COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Staff reads (admin/super_admin see all; others see own rows only).
CREATE OR REPLACE FUNCTION public.staff_audit_list(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roles TEXT[];
  v_rows JSONB;
  v_total INT;
BEGIN
  v_roles := public.my_staff_roles();
  IF v_roles IS NULL OR NOT (v_roles && ARRAY['super_admin', 'admin']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'actor_id', a.actor_id, 'role_used', a.role_used,
    'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
    'result', a.result, 'reason', a.reason, 'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_rows FROM (SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset) a;
  SELECT count(*) INTO v_total FROM admin_audit_log;
  RETURN jsonb_build_object('success', true, 'entries', v_rows, 'total', v_total);
END;
$$;

-- ── 3. USER LOOKUP (least-privilege, safe fields only) ───────
-- support+ roles. Returns public profile fields + operational status.
-- Never emails, never auth data, never message contents.
CREATE OR REPLACE FUNCTION public.staff_user_lookup(p_query TEXT, p_limit INT DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roles TEXT[];
  v_rows JSONB;
BEGIN
  v_roles := public.my_staff_roles();
  IF v_roles IS NULL OR NOT (v_roles && ARRAY['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'operations']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Query too short');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', up.id, 'username', up.username, 'display_name', up.display_name,
    'bio', up.bio, 'avatar_url', up.avatar_url,
    'is_banned', COALESCE(up.is_banned, false),
    'follower_count', COALESCE(up.follower_count, 0),
    'created_at', up.created_at
  ) ORDER BY up.follower_count DESC NULLS LAST), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT * FROM user_profiles
    WHERE username ILIKE '%' || trim(p_query) || '%'
       OR display_name ILIKE '%' || trim(p_query) || '%'
    ORDER BY follower_count DESC NULLS LAST
    LIMIT LEAST(p_limit, 25)
  ) up;
  RETURN jsonb_build_object('success', true, 'users', v_rows);
END;
$$;

-- Active restrictions for one user (support+; transparency for ops).
CREATE OR REPLACE FUNCTION public.staff_user_restrictions(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roles TEXT[];
  v_rows JSONB;
BEGIN
  v_roles := public.my_staff_roles();
  IF v_roles IS NULL OR NOT (v_roles && ARRAY['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'operations']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'action_type', ur.action_type, 'reason', ur.reason,
    'expires_at', ur.expires_at, 'created_at', ur.created_at
  ) ORDER BY ur.created_at DESC), '[]'::jsonb)
  INTO v_rows FROM user_restrictions ur
  WHERE ur.user_id = p_user AND ur.active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now());
  RETURN jsonb_build_object('success', true, 'restrictions', v_rows);
END;
$$;

-- ── 4. INCIDENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'SEV-4' CHECK (severity IN ('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4')),
  subsystem TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'mitigated', 'resolved')),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timeline JSONB NOT NULL DEFAULT '[]',
  resolution TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, severity, created_at DESC);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
-- Deny-all: all access via definer RPCs below.

CREATE OR REPLACE FUNCTION public.staff_incidents_list(p_status TEXT DEFAULT 'open', p_limit INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT public.has_staff_role(ARRAY['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'analyst', 'operations']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'title', i.title, 'severity', i.severity, 'subsystem', i.subsystem,
    'status', i.status, 'owner_id', i.owner_id, 'timeline', i.timeline,
    'resolution', i.resolution, 'created_at', i.created_at, 'updated_at', i.updated_at
  ) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT * FROM incidents
    WHERE (p_status = 'all' OR status = p_status)
    ORDER BY created_at DESC LIMIT p_limit
  ) i;
  RETURN jsonb_build_object('success', true, 'incidents', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_incident_upsert(
  p_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_subsystem TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_resolution TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inc incidents%ROWTYPE;
  v_entry JSONB;
BEGIN
  IF NOT public.has_staff_role(ARRAY['super_admin', 'admin', 'operations']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_id IS NULL THEN
    IF p_title IS NULL OR length(trim(p_title)) < 4 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Title required');
    END IF;
    INSERT INTO incidents (title, severity, subsystem, owner_id, created_by, timeline)
    VALUES (trim(p_title), COALESCE(p_severity, 'SEV-4'), p_subsystem, auth.uid(), auth.uid(),
      jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'note', 'Incident opened')));
    PERFORM public.log_admin_action('INCIDENT_OPENED', 'incident', NULL, 'ok', trim(p_title), '{}');
    RETURN jsonb_build_object('success', true);
  END IF;
  SELECT * INTO v_inc FROM incidents WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Incident not found');
  END IF;
  v_entry := jsonb_build_object('at', now(), 'by', auth.uid(), 'note', COALESCE(p_note, 'Updated'));
  UPDATE incidents SET
    severity = COALESCE(p_severity, severity),
    subsystem = COALESCE(p_subsystem, subsystem),
    status = COALESCE(p_status, status),
    resolution = COALESCE(p_resolution, resolution),
    timeline = timeline || jsonb_build_array(v_entry),
    updated_at = now()
  WHERE id = p_id;
  PERFORM public.log_admin_action('INCIDENT_UPDATED', 'incident', p_id::text, 'ok', p_note, '{}');
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 5. FEATURE FLAG RLS HARDENING ────────────────────────────
-- The open "Admins can manage" (USING true) policy lets ANY client write
-- flags. Runtime evaluation is code/env-driven and never reads this table,
-- so tightening changes no runtime behavior — it just closes the write hole.
DROP POLICY IF EXISTS "Admins can manage feature_flags" ON feature_flags;

-- ── 6. PLATFORM OVERVIEW READ (analyst+, aggregate only) ─────
CREATE OR REPLACE FUNCTION public.staff_platform_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open_reports INT := 0;
  v_escalated INT := 0;
  v_mod_24h INT := 0;
  v_safety_24h INT := 0;
  v_banned INT := 0;
BEGIN
  IF NOT public.has_staff_role(ARRAY['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'analyst', 'operations']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  BEGIN SELECT count(*) INTO v_open_reports FROM reports WHERE status = 'open'; EXCEPTION WHEN OTHERS THEN v_open_reports := NULL; END;
  BEGIN SELECT count(*) INTO v_escalated FROM reports WHERE status = 'escalated'; EXCEPTION WHEN OTHERS THEN v_escalated := NULL; END;
  BEGIN SELECT count(*) INTO v_mod_24h FROM moderation_actions WHERE created_at > now() - interval '24 hours'; EXCEPTION WHEN OTHERS THEN v_mod_24h := NULL; END;
  BEGIN SELECT count(*) INTO v_safety_24h FROM safety_events WHERE created_at > now() - interval '24 hours' AND risk_level IN ('high', 'critical'); EXCEPTION WHEN OTHERS THEN v_safety_24h := NULL; END;
  BEGIN SELECT count(*) INTO v_banned FROM user_profiles WHERE is_banned = true; EXCEPTION WHEN OTHERS THEN v_banned := NULL; END;
  RETURN jsonb_build_object('success', true,
    'open_reports', v_open_reports, 'escalated_reports', v_escalated,
    'moderation_actions_24h', v_mod_24h, 'high_risk_events_24h', v_safety_24h,
    'banned_users', v_banned);
END;
$$;
