import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, auditAction, controlRateLimit, SECTION_ROLES } from '@/lib/staff';

/**
 * Incidents (operations own writes; all staff may read).
 * GET /api/control/incidents?status= — list via staff-gated RPC.
 * POST — open incident { title, severity, subsystem }.
 * PATCH — update { id, status, severity, subsystem, note, resolution }.
 * Every write is audit-logged server-side.
 */
const SEVERITIES = ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'];
const STATUSES = ['open', 'investigating', 'mitigated', 'resolved'];

export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.incidents);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || 'open').toLowerCase();
  if (!['open', 'investigating', 'mitigated', 'resolved', 'all'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  try {
    const { data } = await staff.client.rpc('staff_incidents_list', { p_status: status, p_limit: 50 });
    if (data?.success === false) return NextResponse.json({ error: data.error || 'Failed to load' }, { status: 403 });
    return NextResponse.json({ success: true, incidents: data?.incidents || [] });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function POST(request) {
  const staff = await requireStaff(request, SECTION_ROLES.incidents_write);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim().slice(0, 200);
  const severity = String(body.severity || 'SEV-4').toUpperCase();
  const subsystem = String(body.subsystem || '').trim().slice(0, 80) || null;
  if (title.length < 4) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  if (!SEVERITIES.includes(severity)) return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });

  try {
    const { data } = await staff.client.rpc('staff_incident_upsert', {
      p_title: title, p_severity: severity, p_subsystem: subsystem,
    });
    if (data?.success === false) return NextResponse.json({ error: data.error || 'Failed to open incident' }, { status: 403 });
    auditAction(staff.client, { action: 'INCIDENT_OPENED_API', targetType: 'incident', reason: title, metadata: { severity } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const staff = await requireStaff(request, SECTION_ROLES.incidents_write);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch = { p_id: id };
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    patch.p_status = body.status;
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(String(body.severity).toUpperCase())) return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
    patch.p_severity = String(body.severity).toUpperCase();
  }
  if (body.subsystem !== undefined) patch.p_subsystem = String(body.subsystem).slice(0, 80) || null;
  if (body.note !== undefined) patch.p_note = String(body.note).slice(0, 1000) || null;
  if (body.resolution !== undefined) patch.p_resolution = String(body.resolution).slice(0, 2000) || null;

  try {
    const { data } = await staff.client.rpc('staff_incident_upsert', patch);
    if (data?.success === false) return NextResponse.json({ error: data.error || 'Failed to update incident' }, { status: 403 });
    auditAction(staff.client, { action: 'INCIDENT_UPDATED_API', targetType: 'incident', targetId: String(id), metadata: patch.p_status ? { status: patch.p_status } : {} });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
