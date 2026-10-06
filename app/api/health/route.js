/**
 * BURN BOARD — Health Check API
 * 
 * Provides system health status for monitoring.
 * GET /api/health - Basic health check
 * GET /api/health?detail=true - Detailed health check
 */

import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getCacheStats } from '@/lib/cache';
import { getRateLimitStats } from '@/lib/serverRateLimit';

export const runtime = 'edge';

export async function GET(request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detail') === 'true';
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  };
  
  // Basic check: always passes
  if (!detailed) {
    return NextResponse.json(health);
  }
  
  // Detailed checks
  const checks = {};
  
  // 1. Database connectivity
  try {
    if (isSupabaseConfigured && supabase) {
      const dbStart = Date.now();
      const { error } = await supabase
        .from('hot_seats')
        .select('id', { count: 'exact', head: true });
      
      checks.database = {
        status: error ? 'degraded' : 'ok',
        latencyMs: Date.now() - dbStart,
        configured: true,
      };
    } else {
      checks.database = {
        status: 'not_configured',
        configured: false,
      };
    }
  } catch (err) {
    console.error('[Health] Database check failed:', err?.message || err);
    checks.database = {
      status: 'error',
      configured: isSupabaseConfigured,
    };
  }
  
  // 2. Cache stats
  try {
    const cacheStats = getCacheStats();
    checks.cache = {
      status: 'ok',
      ...cacheStats,
    };
  } catch (err) {
    console.error('[Health] Cache check failed:', err?.message || err);
    checks.cache = {
      status: 'error',
    };
  }
  
  // 3. Rate limiter stats
  try {
    const rlStats = getRateLimitStats();
    checks.rateLimiter = {
      status: 'ok',
      ...rlStats,
    };
  } catch (err) {
    console.error('[Health] Rate limiter check failed:', err?.message || err);
    checks.rateLimiter = {
      status: 'error',
    };
  }
  
  // Determine overall status
  const hasError = Object.values(checks).some(c => c.status === 'error');
  const hasDegraded = Object.values(checks).some(c => c.status === 'degraded');
  
  health.status = hasError ? 'error' : hasDegraded ? 'degraded' : 'ok';
  health.checks = checks;
  health.latencyMs = Date.now() - start;
  
  const statusCode = hasError ? 503 : 200;
  
  return NextResponse.json(health, { status: statusCode });
}
