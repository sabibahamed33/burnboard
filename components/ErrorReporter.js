'use client';

import { useEffect } from 'react';
import { installGlobalErrorReporters } from '@/lib/clientErrors';

/**
 * Mounts window error + unhandledrejection reporters once.
 * No UI. No PII. Fire-and-forget POST /api/errors.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const cleanup = installGlobalErrorReporters();
    return cleanup;
  }, []);
  return null;
}
