import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, auditAction, controlRateLimit, SECTION_ROLES } from '@/lib/staff';

/**
 * GET /api/control/flags — feature-flag inventory, read-only (operations+).
 * Merges declared DB rows with effective code defaults + env overrides and
 * reports the EFFECTIVE value per flag. Runtime evaluation stays
 * code/env-driven (never the DB table); this endpoint is honest
 * observability, not a fake control plane — no toggle that lies.
 */
const CODE_DEFAULTS = {
  social_feed: true,
  social_profiles: true,
  social_follow: false,
  social_reactions_v2: true,
  social_comments: true,
  social_communities: false,
  social_challenges_v2: false,
  social_discover_v2: false,
  social_search: false,
  social_stories: false,
  social_reputation: false,
  new_nav_shell: false,
  mobile_bottom_nav: true,
  content_polls: true,
  content_opinions: true,
  content_photos: true,
  content_hot_takes: true,
  content_questions: true,
};

function envOverride(name) {
  const key = `NEXT_PUBLIC_FEATURE_${String(name).toUpperCase()}`;
  const val = process.env[key];
  if (val === undefined) return null;
  return val === 'true' || val === '1';
}

export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.flags);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  let declared = [];
  try {
    const { data } = await staff.client.from('feature_flags').select('flag_name, enabled, description, updated_at').order('flag_name');
    declared = data || [];
  } catch {}
  const declaredByName = new Map(declared.map((d) => [d.flag_name, d]));
  const names = [...new Set([...Object.keys(CODE_DEFAULTS), ...declaredByName.keys()])].sort();

  const flags = names.map((name) => {
    const codeDefault = CODE_DEFAULTS[name] ?? false;
    const env = envOverride(name);
    return {
      name,
      code_default: codeDefault,
      env_override: env,
      db_declared: declaredByName.get(name)?.enabled ?? null,
      effective: env ?? codeDefault,
      evaluation: 'code/env (DB table is inventory only)',
    };
  });

  auditAction(staff.client, { action: 'CONTROL_FLAGS_VIEWED', result: 'ok' });
  return NextResponse.json({ success: true, flags });
}
