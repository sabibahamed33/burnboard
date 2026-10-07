/**
 * BurnBoard Home Feed — quality scenarios (client-verifiable subset).
 *
 * Covers the pipeline stages that are pure client logic:
 *   - TEST 7:  creator domination cannot create duplicate rows via pagination
 *   - TEST 8:  realtime arrivals never duplicate existing items
 *   - TEST 9:  pagination merges without duplicates or data loss
 *   - TEST 10: failed API payloads degrade to a retryable state (no crash)
 *   - TEST 12: user switch resets feed state (no cross-user leak)
 *
 * Server-side ranking scenarios (new-user cold start, follow boost, affinity,
 * velocity, decay, diversity ordering, block filtering) live in
 * lib/reco/feedBuilder.js + lib/reco/config.js and are exercised against a
 * live database; this file guards the client contract so those guarantees
 * survive pagination / realtime / refresh.
 *
 * Run: node scripts/feed-quality-test.js
 */

import { feedItemKey, mergeFeedItems, isKnownItem } from '../lib/feed/clientUtils.js';

let passed = 0;
let failed = 0;

function assert(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeItem(type, id, author = 'alice') {
  return { id, type, text: `item ${id}`, author: { username: author }, createdAt: new Date().toISOString() };
}

// ── TEST 9: pagination ──────────────────────────────────────────
console.log('\nTEST 9 — pagination: no duplicates or missing pages');
{
  const page1 = [makeItem('social_post', 1), makeItem('social_post', 2), makeItem('roast', 1)];
  const page2 = [makeItem('social_post', 2), makeItem('social_post', 3), makeItem('roast', 1)]; // overlap
  let feed = mergeFeedItems([], page1, true);
  feed = mergeFeedItems(feed, page2, false);
  const keys = feed.map(feedItemKey);
  assert('overlapping pages merge without duplicates', new Set(keys).size === keys.length, keys.join(','));
  assert('all unique items retained (4)', feed.length === 4, `got ${feed.length}`);
  // roast:1 and social_post:1 coexist — different tables, different identity
  assert('cross-type id collision kept distinct', feed.filter((i) => i.id === 1).length === 2);
}

// ── TEST 8: realtime ────────────────────────────────────────────
console.log('\nTEST 8 — realtime: no duplicate, no broken ranking');
{
  const feed = [makeItem('social_post', 1), makeItem('roast', 5)];
  assert('known realtime id detected', isKnownItem(feed, 5, 'roast') === true);
  assert('unknown realtime id detected', isKnownItem(feed, 6, 'roast') === false);
  const merged = mergeFeedItems(feed, [makeItem('roast', 5), makeItem('social_post', 9)], false);
  assert('re-delivered realtime payload not duplicated', merged.length === 3, `got ${merged.length}`);
}

// ── TEST 7: same creator, many posts ────────────────────────────
console.log('\nTEST 7 — creator flood: identity stays unique per post');
{
  const flood = Array.from({ length: 20 }, (_, i) => makeItem('social_post', 100 + i, 'prolific'));
  const feed = mergeFeedItems([], flood, true);
  assert('20 distinct posts from one creator all kept once', feed.length === 20, `got ${feed.length}`);
  const twice = mergeFeedItems(feed, flood, false);
  assert('re-fetch of same flood adds nothing', twice.length === 20, `got ${twice.length}`);
}

// ── Refresh ─────────────────────────────────────────────────────
console.log('\nREFRESH — refresh resets without duplicates');
{
  const old = [makeItem('social_post', 1), makeItem('social_post', 2)];
  const fresh = [makeItem('social_post', 2), makeItem('social_post', 2), makeItem('social_post', 3)];
  const feed = mergeFeedItems(old, fresh, true);
  assert('refresh replaces + dedupes internally', feed.length === 2, `got ${feed.length}`);
  assert('refresh keeps newest set', feed.map((i) => i.id).join(',') === '2,3');
}

// ── TEST 10: failure payloads ───────────────────────────────────
console.log('\nTEST 10 — API failure: friendly retry, no crash');
{
  let crashed = false;
  try {
    const a = mergeFeedItems([makeItem('social_post', 1)], null, false);
    const b = mergeFeedItems(a, undefined, false);
    assert('null/undefined payloads merge safely', b.length === 1);
  } catch {
    crashed = true;
  }
  assert('no exception on malformed payload', crashed === false);
}

// ── TEST 12: user switch ────────────────────────────────────────
console.log('\nTEST 12 — user switch: no personalized state leak');
{
  // The client must drop items + cursor on account change; contract: refresh
  // merge with the new user's first page never retains old items.
  const userAFeed = [makeItem('social_post', 1, 'alice'), makeItem('roast', 2, 'alice')];
  const userBFirst = [makeItem('social_post', 7, 'bob')];
  const afterSwitch = mergeFeedItems(userAFeed, userBFirst, true);
  assert('previous user feed fully replaced', afterSwitch.length === 1 && afterSwitch[0].id === 7);
}

// ── Key stability ───────────────────────────────────────────────
console.log('\nIDENTITY — stable keys across rerenders');
{
  const a = makeItem('roast', 42);
  const b = makeItem('roast', 42);
  assert('same post always maps to same key', feedItemKey(a) === feedItemKey(b));
  assert('key includes type namespace', feedItemKey(a).startsWith('roast:'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
