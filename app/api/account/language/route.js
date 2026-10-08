import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

const SUPPORTED = ['en', 'bn', 'es', 'fr', 'ar', 'hi'];

function norm(locale) {
  if (!locale || typeof locale !== 'string') return null;
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(base) ? base : null;
}

/** GET /api/account/language — signed-in USER's saved display language. */
export async function GET(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ locale: null, signedIn: false });
    const { data } = await auth.client.from('user_profiles').select('locale').eq('id', auth.userId).single();
    return NextResponse.json({ locale: norm(data?.locale) || null, signedIn: true });
  } catch {
    return NextResponse.json({ locale: null, signedIn: false });
  }
}

/** PUT /api/account/language { locale } — save explicit USER preference. */
export async function PUT(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const locale = norm(body.locale);
    if (!locale) return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    const { error } = await auth.client.from('user_profiles').update({ locale }).eq('id', auth.userId);
    if (error) return NextResponse.json({ error: 'Could not save language' }, { status: 400 });
    return NextResponse.json({ success: true, locale });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
