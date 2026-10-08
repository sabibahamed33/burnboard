import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, SECTION_ROLES } from '@/lib/staff';

/** GET /api/control/me — signed-in caller's internal staff roles (or 403). */
export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.me);
  if (!staff.ok) return staffDenied(staff);
  return NextResponse.json({ userId: staff.userId, roles: staff.roles });
}
