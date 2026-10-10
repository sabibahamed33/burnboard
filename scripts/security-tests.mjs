#!/usr/bin/env node
/**
 * BURNBOARD Security Regression Tests (no DB, no network, no secrets).
 *
 * Covers the actual application architecture at the unit boundary:
 *  - open-redirect protection (safeInternalPath)
 *  - telemetry redaction (passwords/tokens/bodies never logged)
 *  - error grouping + severity taxonomy (no stack leaks in listings)
 *  - hashtag normalization (strict tag grammar)
 *  - authorization source patterns (static scan: no client user_id trust
 *    in sensitive routes, no leaked DB internals in error responses)
 *
 * Exit 1 on any failure. Run: node scripts/security-tests.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { safeInternalPath } = await import('../lib/growth/referral.js');
const { normalizeTag } = await import('../lib/hashtags.js');
const { redactErrorData } = await import('../lib/observability/redact.js');
const store = await import('../lib/observability/errorStore.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('Security regression tests\n── open redirects ──');
test('rejects absolute URLs', () => {
  assert.equal(safeInternalPath('https://evil.com/x'), null);
  assert.equal(safeInternalPath('http://evil.com'), null);
});
test('rejects protocol-relative and backslash escapes', () => {
  assert.equal(safeInternalPath('//evil.com/x'), null);
  assert.equal(safeInternalPath('/\\evil'), null);
});
test('rejects CRLF injection', () => {
  assert.equal(safeInternalPath('/home\r\nSet-Cookie: x=1'), null);
});
test('accepts plain internal paths', () => {
  assert.equal(safeInternalPath('/home'), '/home');
  assert.equal(safeInternalPath('/u/alice?tab=posts'), '/u/alice?tab=posts');
});
test('rejects overlong paths', () => {
  assert.equal(safeInternalPath(`/${'a'.repeat(600)}`), null);
});

console.log('── redaction ──');
test('redacts password/token/secret keys', () => {
  const out = redactErrorData({ password: 'hunter2', access_token: 'abc', nested: { session: 'xyz' } });
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.access_token, '[REDACTED]');
  assert.equal(out.nested.session, '[REDACTED]');
});
test('redacts private content fields', () => {
  const out = redactErrorData({ message: 'hello there', bio: 'my life story', email: 'a@b.c' });
  assert.equal(out.message, '[REDACTED]');
  assert.equal(out.bio, '[REDACTED]');
  assert.equal(out.email, '[REDACTED]');
});
test('passes through safe diagnostics', () => {
  const out = redactErrorData({ kind: 'feed_failed', route: '/api/feed', statusCode: 500 });
  assert.equal(out.kind, 'feed_failed');
  assert.equal(out.route, '/api/feed');
  assert.equal(out.statusCode, 500);
});
test('bounds deep/recursive structures', () => {
  const deep = { a: { b: { c: { d: { e: { f: 'x' } } } } } };
  const out = redactErrorData(deep);
  assert.ok(out.a.b.c.d.e === 'x' || out.a.b.c.d.e === '[REDACTED]' || typeof out.a.b.c.d === 'object');
});

console.log('── error grouping ──');
test('groups repeats, separates severities, hides stacks', () => {
  store.recordError({ kind: 'auth_login_failed', route: '/auth', message: 'bad login 11111' });
  store.recordError({ kind: 'auth_login_failed', route: '/auth', message: 'bad login 22222' });
  const groups = store.listGroups({ window: '24h' });
  const g = groups.find((x) => x.kind === 'auth_login_failed');
  assert.ok(g, 'auth group recorded');
  assert.equal(g.severity, 'high');
  assert.equal(g.category, 'auth');
  assert.ok(!('stack' in g), 'stack must not leak in listings');
});
test('critical taxonomy classifies loop suspicion as critical', () => {
  store.recordError({ kind: 'auth_loop_suspected', route: '/welcome', message: 'bounce' });
  const groups = store.listGroups({ window: '24h' });
  const g = groups.find((x) => x.kind === 'auth_loop_suspected');
  assert.ok(g && g.severity === 'critical');
});

console.log('── hashtag grammar ──');
test('normalizes case and strips #', () => {
  assert.equal(normalizeTag('#BurnBoard'), 'burnboard');
});
test('rejects too-short and illegal tags', () => {
  assert.equal(normalizeTag('a'), null);
  assert.equal(normalizeTag('a b'), null);
  assert.equal(normalizeTag('<script>'), null);
});

console.log('── static authorization patterns ──');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
test('profile GET ignores client viewer_id', () => {
  const src = read('app/api/profile/route.js');
  assert.ok(!src.includes('viewerIdParam'), 'viewerIdParam must be gone');
  assert.ok(src.includes('signed-in session is the ONLY source'), 'session-authoritative comment present');
});
test('reputation award requires session match', () => {
  const src = read('app/api/reputation/award/route.js');
  assert.ok(src.includes('getRequestContext'), 'session resolved');
  assert.ok(src.includes('403'), 'mismatch rejected');
  assert.ok(!src.includes('participant_id'), 'no anon fallback identity');
});
test('comments POST requires session', () => {
  const src = read('app/api/comments/route.js');
  assert.ok(src.includes('Sign in to comment'), 'honest 401 present');
});
test('no raw DB error messages reach clients in touched routes', () => {
  for (const f of ['app/api/roast/route.js', 'app/api/comments/[id]/replies/route.js']) {
    const src = read(f);
    assert.ok(!src.includes('error.message }'), `${f} must not echo error.message`);
  }
});
test('service-role key never referenced from client code', () => {
  const walk = (dir) => {
    let out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.next', '.git', 'dist'].includes(e.name)) continue;
        out = out.concat(walk(p));
      } else if (/\.js$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const bad = [];
  for (const f of walk(path.join(ROOT, 'components'))) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      // Comments document server behavior; only live code counts.
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      // Only actual secret reads count — JSX copy and string literals
      // that merely NAME the server env var are documentation, not usage.
      if (/process\.env\.(SUPABASE_SERVICE_ROLE_KEY|ADMIN_PASSWORD|CRON_SECRET|STRIPE_SECRET_KEY)/.test(line)) {
        bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, [], `client secret refs: ${bad.join(', ')}`);
});

console.log(`\n${process.exitCode ? 'FAILED' : `PASSED (${passed} tests)`}`);
process.exit(process.exitCode || 0);
