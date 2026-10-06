import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req) {
  try {
    const body = await req.json();
    const { profile_id, email, roast_text, roast_id, action = 'notify' } = body;

    // Action 1: Subscribe email to profile notifications
    if (action === 'subscribe') {
      if (!profile_id || !email || !email.includes('@')) {
        return NextResponse.json({ error: 'Valid email and profile_id required' }, { status: 400 });
      }

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('email_subscribers')
          .upsert(
            [{ profile_id, email: email.toLowerCase().trim(), created_at: new Date().toISOString() }],
            { onConflict: 'profile_id,email' }
          )
          .select();

        if (error) {
          // If table doesn't have unique constraint, standard insert
          await supabase.from('email_subscribers').insert([
            { profile_id, email: email.toLowerCase().trim(), created_at: new Date().toISOString() }
          ]);
        }
      }

      return NextResponse.json({ success: true, message: 'Subscribed to roast notifications' });
    }

    // Action 2: Trigger notifications to subscribers of this profile
    if (!profile_id || !roast_text) {
      return NextResponse.json({ error: 'profile_id and roast_text required' }, { status: 400 });
    }

    let subscribers = [];
    let profileUsername = 'A user';

    if (isSupabaseConfigured && supabase) {
      const { data: subs } = await supabase
        .from('email_subscribers')
        .select('email')
        .eq('profile_id', profile_id);

      if (subs) subscribers = subs.map(s => s.email);

      const { data: prof } = await supabase
        .from('profiles')
        .select('username, platform')
        .eq('id', profile_id)
        .single();

      if (prof) profileUsername = `@${prof.username} (${prof.platform})`;
    }

    // If RESEND_API_KEY is provided, send real emails
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && subscribers.length > 0) {
      const resend = new Resend(resendApiKey);
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://burnboard.app';
      const postUrl = `${siteUrl}/#post/${profile_id}`;

      // Send to each subscriber (up to 10 max per batch for safety)
      const emailsToSend = subscribers.slice(0, 10).map(subEmail => ({
        from: 'BURNBOARD Alerts <burns@burnboard.app>',
        to: subEmail,
        subject: `🔥 ${profileUsername} just got roasted on BURNBOARD`,
        html: `
          <div style="font-family: monospace, sans-serif; background: #0a0a0a; color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #ff4d00;">
            <h1 style="color: #ff4d00; font-size: 22px; margin-bottom: 8px;">🔥 Fresh Burn Alert!</h1>
            <p style="color: #a1a1aa; font-size: 14px;">A new anonymous roast was just fired at <strong>${profileUsername}</strong>:</p>
            
            <div style="background: #141414; border-left: 4px solid #ff4d00; padding: 16px; margin: 18px 0; border-radius: 6px;">
              <p style="font-size: 16px; font-weight: bold; color: #ffffff; margin: 0; line-height: 1.4;">
                "${roast_text}"
              </p>
            </div>

            <p style="margin-top: 20px;">
              <a href="${postUrl}" style="background: #ff4d00; color: #000000; font-weight: 900; text-decoration: none; padding: 10px 20px; border-radius: 8px; display: inline-block;">
                View Roast & Counter-Attack 🔥
              </a>
            </p>
            
            <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
            <p style="color: #71717a; font-size: 11px;">
              You received this because you subscribed to alerts for this profile on BURNBOARD.
            </p>
          </div>
        `
      }));

      await Promise.allSettled(emailsToSend.map(msg => resend.emails.send(msg)));
    }

    return NextResponse.json({
      success: true,
      subscribersNotified: subscribers.length
    });
  } catch (err) {
    console.error('[Notify] Error:', err?.message || err);
    return NextResponse.json({ error: 'Notification failure' }, { status: 500 });
  }
}
