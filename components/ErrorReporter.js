'use client';

import { useEffect } from 'react';
import { installGlobalErrorReporters } from '@/lib/clientErrors';
import { installWebVitals } from '@/lib/webVitals';

/**
 * Mounts window error + unhandledrejection reporters and sampled
 * Web-Vitals RUM once. No UI. No PII. Fire-and-forget POST /api/errors.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const cleanup = installGlobalErrorReporters();
    installWebVitals();
    return cleanup;
  }, []);
  return null;
}
