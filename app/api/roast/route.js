import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { instrumentHandler } from '@/lib/metrics';
import { isProfane } from '@/lib/filter';

const SALT = process.env.RATE_LIMIT_SALT || 'burnboard_secret_salt_2024';

function hashIp(ip) {
  return crypto.createHash('sha256').update((ip || '127.0.0.1') + SALT).digest('hex').substring(0, 16);
}

async function postHandler(req) {
  try {
    const body = await req.json();
    const { profile_id, roast_text, anon_id, savage_level } = body;

    if (!profile_id || !roast_text || !roast_text.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. IP Hash determination
    const forwardedFor = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    const ip = forwardedFor.split(',')[0].trim();
    const ip_hash = hashIp(ip);

    // 2. Check Blacklist & Profanity
    const profanityCheck = isProfane(roast_text);
    if (profanityCheck.profane) {
      return NextResponse.json(
        { error: `Roast rejected: ${profanityCheck.reason || 'Contains prohibited hate speech'}` },
        { status: 422 }
      );
    }

    if (isSupabaseConfigured && supabase) {
      // 3. Check blocked_ips table
      const { data: blocked } = await supabase
        .from('blocked_ips')
        .select('*')
        .eq('ip_hash', ip_hash)
        .single();

      if (blocked) {
        return NextResponse.json(
          { error: `Your IP has been permanently extinguished: ${blocked.reason || 'Policy violation'}` },
          { status: 403 }
        );
      }

      // 4. Check 5 roasts in last 10 minutes from same IP
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentIpRoasts } = await supabase
        .from('roasts')
        .select('id')
        .eq('ip_hash', ip_hash)
        .gte('created_at', tenMinutesAgo);

      if (recentIpRoasts && recentIpRoasts.length >= 5) {
        return NextResponse.json(
          { error: 'Spam limit reached: Maximum 5 roasts per 10 minutes. Please take a breather.' },
          { status: 429 }
        );
      }

      // 5. Check duplicate roast for same profile in last 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: duplicateRoasts } = await supabase
        .from('roasts')
        .select('id, roast_text')
        .eq('profile_id', profile_id)
        .gte('created_at', oneHourAgo);

      const isDuplicate = duplicateRoasts?.some(
        r => r.roast_text.trim().toLowerCase() === roast_text.trim().toLowerCase()
      );

      if (isDuplicate) {
        return NextResponse.json(
          { error: 'Already roasted with this line, be more creative!' },
          { status: 409 }
        );
      }

      // 6. Insert new roast
      const validLevels = ['mild', 'savage', 'toxic', 'bangla'];
      const level = validLevels.includes(savage_level) ? savage_level : 'savage';

      const newRoast = {
        profile_id,
        roast_text: roast_text.trim(),
        anon_id: anon_id || 'Anon Roaster',
        ip_hash,
        upvotes: 0,
        reaction_haha: 0,
        reaction_brutal: 0,
        reaction_cry: 0,
        savage_level: level,
        created_at: new Date().toISOString()
      };

      const { data: inserted, error: insertError } = await supabase
        .from('roasts')
        .insert([newRoast])
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Trigger email notifications in background (Task 4)
      try {
        const notifyUrl = new URL('/api/notify', req.url).toString();
        fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id,
            roast_text: roast_text.trim(),
            roast_id: inserted.id
          })
        }).catch(() => {});
      } catch {}

      return NextResponse.json({ success: true, roast: inserted });
    }

    // Local / Dev Fallback
    return NextResponse.json({
      success: true,
      roast: {
        id: 'roast-' + Date.now(),
        profile_id,
        roast_text: roast_text.trim(),
        anon_id: anon_id || 'Anon Roaster',
        ip_hash,
        upvotes: 0,
        reaction_haha: 0,
        reaction_brutal: 0,
        reaction_cry: 0,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Roast] Submission error:', err?.message || err);
    return NextResponse.json({ error: 'Unable to submit your roast right now. Please try again.' }, { status: 500 });
  }
}

export const POST = instrumentHandler('roast', postHandler);
