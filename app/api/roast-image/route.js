import { NextResponse } from 'next/server';
import { generateVisionRoast } from '@/lib/ai/provider';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

/**
 * POST /api/roast-image
 *
 * Accepts a multipart form upload with an image file.
 * Uses the AI provider abstraction (Gemini Vision when configured) to
 * generate a savage roast in Bangla + English mix. All provider calls are
 * centralized in lib/ai/provider.js — this route only prepares input and
 * shapes output.
 *
 * Body (FormData):
 *   - image: File (required)
 *   - target_username: string (optional)
 *   - savage_level: 'mild' | 'savage' | 'toxic' | 'bangla' (optional, default 'savage')
 *
 * Response:
 *   { success: true, roast: string, level: string }
 */

export async function POST(req) {
  try {
    // AI-cost endpoint: rate-limit before parsing the upload.
    const imgLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'roast_image'), RATE_LIMITS.AI_IMAGE);
    if (imgLimit.blocked) {
      return NextResponse.json({ error: imgLimit.response.error, retryAfter: imgLimit.retryAfterSeconds }, { status: 429 });
    }

    const formData = await req.formData();
    const imageFile = formData.get('image');
    const rawUsername = formData.get('target_username');
    const rawLevel = formData.get('savage_level');
    // Bound free-form fields (prompt-injection + AI-cost surface).
    const targetUsername = typeof rawUsername === 'string' && rawUsername.trim()
      ? rawUsername.trim().slice(0, 40)
      : 'this person';
    const savageLevel = ['mild', 'savage', 'toxic', 'bangla'].includes(rawLevel) ? rawLevel : 'savage';

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        { error: 'Image too large. Max size: 10MB' },
        { status: 400 }
      );
    }

    // Verify magic bytes — the client Content-Type header is spoofable,
    // so confirm the payload starts with a known image signature before
    // spending AI budget on it.
    const arrayBuffer = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isGif = bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
    const isWebp = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return NextResponse.json(
        { error: 'File content is not a supported image.' },
        { status: 400 }
      );
    }

    // Convert image to base64
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageFile.type;

    // Centralized provider call (Gemini Vision when configured; clean
    // 'not configured' response otherwise — identical UX to before).
    const result = await generateVisionRoast({ imageBase64: base64Image, mimeType, savageLevel });

    if (!result.success) {
      if (result.code === 'not_configured') {
        return NextResponse.json(
          { error: 'AI vision service not configured. GEMINI_API_KEY is missing.' },
          { status: 503 }
        );
      }
      if (result.code === 'provider_error' || result.error) {
        console.error('[roast-image] AI error:', result.error);
        return NextResponse.json(
          { error: 'AI roast generation failed. Please try again.' },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: 'AI could not generate a roast for this image. Try a different photo.' },
        { status: 422 }
      );
    }

    // Clean up the roast: remove quotes and extra formatting
    const cleanedRoast = (result.roast || '')
      .replace(/^["'"`]+|["'"`]+$/g, '')
      .replace(/^Roast:\s*/i, '')
      .replace(/^Here'?s a roast:?\s*/i, '')
      .trim();

    if (!cleanedRoast) {
      return NextResponse.json(
        { error: 'AI could not generate a roast for this image. Try a different photo.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      roast: cleanedRoast,
      level: savageLevel,
      username: targetUsername,
    });
  } catch (err) {
    console.error('[roast-image] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
