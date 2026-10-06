import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(req) {
  try {
    const body = await req.json();
    const { profile_id, email } = body;

    if (!profile_id || !email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email and profile_id required' }, { status: 400 });
    }

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase
        .from('email_subscribers')
        .insert([{ profile_id, email: email.trim().toLowerCase() }]);

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ success: true, message: 'Already subscribed to profile alerts.' });
        }
        console.error('[Subscribe] Error:', error.message);
        return NextResponse.json({ error: 'Unable to subscribe right now. Please try again.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'Subscribed to profile alerts.' });
  } catch (err) {
    console.error('[Subscribe] Error:', err?.message || err);
    return NextResponse.json({ error: 'Unable to subscribe right now. Please try again.' }, { status: 500 });
  }
}
