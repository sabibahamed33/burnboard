/**
 * Community mute — client-side preference.
 *
 * Muting a community hides it from your discovery lists (hub sections,
 * recommendations) and dims its presence. Author-level blocks/mutes are
 * enforced server-side in every community feed; this preference only
 * affects discovery surfaces on this device.
 */

const KEY = 'burnboard_muted_communities';

function readSet() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function isCommunityMuted(communityId) {
  if (!communityId || typeof localStorage === 'undefined') return false;
  try {
    return readSet().has(String(communityId));
  } catch {
    return false;
  }
}

export function setCommunityMuted(communityId, muted) {
  if (!communityId || typeof localStorage === 'undefined') return;
  try {
    const set = readSet();
    if (muted) set.add(String(communityId));
    else set.delete(String(communityId));
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {}
}

export function getMutedCommunityIds() {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    return readSet();
  } catch {
    return new Set();
  }
}
