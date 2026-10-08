'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, BarChart3, Users, Trophy, Loader2, ExternalLink,
  Pin, PinOff, RefreshCw, ArrowRight, Flame, Wallet
} from 'lucide-react';

/**
 * /creator — private My Insights (universal user feature)
 *
 * Everything rendered here comes from /api/creator/dashboard + /api/creator/content,
 * which compute REAL metrics only (posts, reactions, comments, followers,
 * genuine feed impressions). No invented numbers, no viewer identities, no
 * public-facing internal scores.
 */

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'content', label: 'Content', icon: BarChart3 },
  { key: 'audience', label: 'Audience', icon: Users },
  { key: 'milestones', label: 'Milestones', icon: Trophy },
  { key: 'revenue', label: 'Revenue', icon: Wallet },
];

// ── Helpers ────────────────────────────────────────────────
function formatCount(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const past = new Date(dateString);
  if (Number.isNaN(past.getTime())) return '';
  const diff = Math.max(0, Math.floor((Date.now() - past.getTime()) / 1000));
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDay(dateString) {
  const d = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Small building blocks ──────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#111] border border-[#222] rounded-2xl p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-3">
      <h2 className="text-sm font-black text-white uppercase tracking-wider">{children}</h2>
      {hint && <p className="text-[10px] font-mono text-zinc-500 text-right">{hint}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = 'text-white' }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded-2xl p-4 min-w-0">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon className="w-4 h-4" />
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-black mt-2 ${accent}`}>{formatCount(value)}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1 font-mono">{sub}</p>}
    </div>
  );
}

function GrowthBars({ series }) {
  if (!series?.length) {
    return (
      <p className="text-xs text-zinc-500 py-6 text-center font-mono">
        No follower activity recorded in this window yet.
      </p>
    );
  }
  const max = Math.max(1, ...series.map((d) => d.count));
  const total = series.reduce((s, d) => s + d.count, 0);
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24" role="img" aria-label={`Follower growth chart: ${total} new followers in the last 30 days`}>
        {series.map((d) => (
          <div
            key={d.date}
            title={`${formatDay(d.date)}: ${d.count} new follower${d.count === 1 ? '' : 's'}`}
            className="flex-1 min-w-0 rounded-t bg-[#ff4d00]/60 hover:bg-[#ff4d00] transition-colors"
            style={{ height: `${Math.max(d.count > 0 ? 6 : 1, Math.round((d.count / max) * 100))}%` }}
          />
        ))}
      </div>
      <p className="sr-only">
        Daily new followers over the last 30 days. Total: {total}.
      </p>
      <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-zinc-600">
        <span>{formatDay(series[0]?.date)}</span>
        <span>{total} new followers · 30 days</span>
        <span>{formatDay(series[series.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────
export default function CreatorDashboard() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Content tab pagination state
  const [content, setContent] = useState(null); // { items, total, hasMore }
  const [contentLoading, setContentLoading] = useState(false);
  const [pinBusy, setPinBusy] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/creator/dashboard', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load dashboard');
      setData(payload);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const loadContent = useCallback(async (more = false) => {
    if (!data && !more) return;
    setContentLoading(true);
    try {
      const offset = more && content ? content.items.length : 0;
      const res = await fetch(`/api/creator/content?limit=20&offset=${offset}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load content');
      if (more && content) {
        setContent({
          items: [...content.items, ...payload.items],
          total: payload.total,
          hasMore: payload.hasMore,
        });
      } else {
        setContent({ items: payload.items, total: payload.total, hasMore: payload.hasMore });
      }
    } catch {
      setContentLoading(false);
    } finally {
      setContentLoading(false);
    }
  }, [data, content]);

  useEffect(() => {
    if (tab === 'content' && !content && data) {
      loadContent(false);
    }
  }, [tab, content, data, loadContent]);

  // Pin / unpin featured content (server-validated ownership + visibility).
  const togglePin = useCallback(async (postId) => {
    setPinBusy(postId);
    try {
      const isPinned = data?.profile?.featuredPostId === postId;
      const res = await fetch('/api/creator/featured', {
        method: isPinned ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: isPinned ? undefined : JSON.stringify({ post_id: postId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Pin failed');
      setData((prev) => prev && ({
        ...prev,
        profile: { ...prev.profile, featuredPostId: payload.postId || null },
      }));
    } catch {
      // Ignore — server returns friendly errors on invalid pins.
    } finally {
      setPinBusy(null);
    }
  }, [data]);

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#ff4d00]" />
          <p className="text-xs font-mono text-zinc-500">Loading your insights…</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto bg-[#111] border border-[#222] rounded-2xl p-10 text-center space-y-4">            <p className="text-sm text-red-400 font-mono">{error || 'Could not load your creator data yet. If this is your first time here, make sure the creator migration has been applied.'}</p>
          <button
            onClick={loadDashboard}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { profile, totals, views, milestones = [], nextSteps = [], insights = [], growth = [], recentFollowers = [], recentContent = [] } = data;
  const t7 = totals.last7d || {};
  const tAll = totals.all || {};

  const contentRows = (tab === 'content' && content) ? content.items : recentContent;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-[#ff4d00] flex items-center justify-center text-xl font-black text-black shrink-0">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              (profile.displayName || profile.username || 'C')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-white">@{profile.username}</h1>
              {profile.displayName && (
                <span className="text-sm text-zinc-400">{profile.displayName}</span>
              )}
              {profile.level && profile.level !== 'Newbie' && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#ff4d00]/10 text-[#ff4d00] border border-[#ff4d00]/20">
                  {profile.level}
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-zinc-500 mt-1">
              🔥 {formatCount(profile.karma)} Burn Rep
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${profile.username}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#ff4d00]/50 text-zinc-300 hover:text-white text-xs font-mono font-bold transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View profile
            </Link>
            <Link
              href="/settings/profile"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#ff4d00]/50 text-zinc-300 hover:text-white text-xs font-mono font-bold transition-all"
            >
              Edit profile
            </Link>
          </div>
        </div>

        {/* Recently earned milestones banner */}
        {milestones.slice(0, 2).map((m) => (
          <div key={`banner-${m.key}`} className="bg-[#ff4d00]/10 border border-[#ff4d00]/25 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">{m.icon || '🏆'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Milestone unlocked — {m.label || m.key}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{m.description}</p>
            </div>
            <button
              onClick={() => setTab('milestones')}
              className="text-[10px] font-mono font-bold text-[#ff4d00] hover:text-white flex items-center gap-1"
              aria-label="Open milestones"
            >
              View <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-all flex-1 justify-center ${
                tab === key ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW ═══ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            {/* Stat grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard icon={Users} label="Followers" value={tAll.followers} sub={t7.followers ? `+${t7.followers} in 7 days` : 'No new followers this week'} />
              <StatCard icon={Flame} label="Reactions" value={tAll.reactions} sub={t7.reactions ? `+${t7.reactions} in 7 days` : 'No reactions this week'} />
              <StatCard icon={BarChart3} label="Comments" value={tAll.comments} sub={t7.comments ? `+${t7.comments} in 7 days` : 'No comments this week'} />
              <StatCard icon={LayoutDashboard} label="Posts" value={tAll.posts} sub={tAll.roasts ? `+ ${tAll.roasts} roasts delivered` : 'Start posting to grow'} />
              {views.enabled && (
                <StatCard icon={ExternalLink} label="Views" value={views.total} sub="Real feed impressions" />
              )}
            </div>
            {views.enabled && (
              <p className="text-[10px] font-mono text-zinc-600 -mt-3">
                Views = feed impressions from signed-in members, counted once per member per post per day.
              </p>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <Card>
                <SectionTitle>Insights</SectionTitle>
                <ul className="space-y-2">
                  {insights.map((text, i) => (
                    <li key={i} className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2">
                      <span className="text-[#ff4d00] mt-0.5">›</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Recent content mini list */}
            <Card>
              <SectionTitle hint="Last 30 days">Recent content</SectionTitle>
              {recentContent.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-2xl">🦗</p>
                  <p className="text-xs text-zinc-500">You haven&apos;t posted in the last 30 days.</p>
                  <Link href="/create" className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff4d00] hover:text-white transition-colors">
                    Create a post <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentContent.slice(0, 5).map((item) => (
                    <ContentRow key={item.id} item={item} pinned={profile.featuredPostId === item.id} onPin={togglePin} pinBusy={pinBusy} compact />
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ═══ CONTENT ═══ */}
        {tab === 'content' && (
          <Card>
            <SectionTitle hint={`${content?.total ?? tAll.posts} posts`}>Content performance</SectionTitle>
            {contentLoading && content === null ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#ff4d00]" />
              </div>
            ) : contentRows.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-2xl">📝</p>
                <p className="text-xs text-zinc-500">No posts yet. Your content performance will appear here.</p>
                <Link href="/create" className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff4d00] hover:text-white transition-colors">
                  Create your first post <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {contentRows.map((item) => (
                  <ContentRow key={item.id} item={item} pinned={data?.profile?.featuredPostId === item.id} onPin={togglePin} pinBusy={pinBusy} />
                ))}
                {content?.hasMore && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => loadContent(true)}
                      disabled={contentLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-xs font-mono font-bold text-zinc-300 hover:text-white disabled:opacity-50 transition-all"
                    >
                      {contentLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ═══ AUDIENCE ═══ */}
        {tab === 'audience' && (
          <div className="space-y-5">
            <Card>
              <SectionTitle hint="Real follows, bucketed by day">Follower growth</SectionTitle>
              <GrowthBars series={growth} />
            </Card>

            <Card>
              <SectionTitle hint={`${tAll.followers} total`}>Newest followers</SectionTitle>
              {recentFollowers.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-2xl">🤝</p>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                    No followers yet. Share your profile and keep posting — people find you through your posts.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {recentFollowers.map((f) => (
                    <li key={f.userId}>
                      <Link href={`/u/${f.username}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1a1a1a] transition-all group">
                        <div className="w-9 h-9 rounded-full bg-[#222] flex items-center justify-center text-xs font-black text-zinc-300 overflow-hidden shrink-0">
                          {f.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (f.displayName || f.username || '?')[0].toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate group-hover:text-[#ff4d00] transition-colors">@{f.username}</p>
                          {f.displayName && <p className="text-[11px] text-zinc-500 truncate">{f.displayName}</p>}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-600">followed {timeAgo(f.followedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* ═══ MILESTONES ═══ */}
        {tab === 'milestones' && (
          <div className="space-y-5">
            {milestones.length > 0 && (
              <div>
                <SectionTitle hint="Real achievements, earned from real activity">Earned milestones</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {milestones.map((m) => (
                    <div key={m.key} className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/30 rounded-2xl p-4 flex items-start gap-3 transition-colors">
                      <span className="text-2xl shrink-0">{m.icon || '🏆'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{m.label || m.key}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{m.description}</p>
                        <p className="text-[10px] font-mono text-zinc-600 mt-1.5">{timeAgo(m.achievedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {nextSteps.length > 0 && (
              <div>
                <SectionTitle hint="No pressure — just what&apos;s next">On the horizon</SectionTitle>
                <div className="space-y-3">
                  {nextSteps.map((s) => (
                    <div key={s.key} className="bg-[#0e0e0e] border border-[#1f1f1f] rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-bold text-zinc-300">{s.hint}</p>
                        <p className="text-[10px] font-mono text-zinc-600">{Math.round(s.progress * 100)}%</p>
                      </div>
                      <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#ff4d00] rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(s.progress * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {milestones.length === 0 && nextSteps.length === 0 && (
              <Card>
                <div className="text-center py-8 space-y-2">
                  <p className="text-3xl">🏆</p>
                  <p className="text-sm font-bold text-zinc-300">Milestones appear as you create and grow.</p>
                  <p className="text-xs text-zinc-500">First post, first follower, first reaction — all recorded from real activity.</p>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ═══ REVENUE ═══ */}
        {tab === 'revenue' && (
          <RevenueSection />
        )}

        {/* Privacy note */}
        <p className="text-[10px] font-mono text-zinc-600 text-center pb-6">
          Your insights are private — analytics come from real platform activity only.
        </p>
      </div>
    </div>
  );
}

/**
 * RevenueSection — private user earnings overview.
 * Reads only the user's OWN verified ledger-derived numbers via
 * /api/creator/revenue. Supporter identity is never shown. When monetization
 * isn't enabled on the deployment, a clear explanatory state is shown.
 */
function RevenueSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/creator/revenue', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ available: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Request a payout (MP24): moves AVAILABLE into a pending request. All
  // guards live server-side (owner scope, minimum, single open payout).
  const requestPayout = async () => {
    setRequesting(true);
    setPayoutMessage(null);
    try {
      const res = await fetch('/api/creator/revenue', {
        method: 'POST',
        cache: 'no-store',
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setPayoutMessage({ tone: 'ok', text: `Payout requested — ${json.payout.amount_minor / 100} ${(json.payout.currency || 'usd').toUpperCase()} moved to pending. It will be paid out once eligibility and provider processing are confirmed.` });
        // Refresh the derived balance + payout history.
        const fresh = await fetch('/api/creator/revenue', { cache: 'no-store' }).then(r => r.json());
        setData(fresh);
      } else {
        setPayoutMessage({ tone: 'warn', text: json.message || 'The payout request could not be completed right now.' });
      }
    } catch {
      setPayoutMessage({ tone: 'warn', text: 'The payout request could not be completed right now.' });
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#ff4d00]" />
        </div>
      </Card>
    );
  }

  if (!data?.available) {
    return (
      <Card>
        <div className="text-center py-8 space-y-2">
          <p className="text-3xl">💰</p>
          <p className="text-sm font-bold text-zinc-300">Revenue tools aren&apos;t available yet.</p>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
            Earnings activate on this deployment once monetization is enabled and a payment provider is configured. When it does, your verified earnings will appear here — supporter identities are never shown.
          </p>
        </div>
      </Card>
    );
  }

  const { balance = {}, payouts = [], sales = [] } = data;
  const payoutMin = data.payoutMin || null;
  const openPayout = payouts.some(p => ['pending', 'held', 'processing'].includes(p.status));
  const canRequest = !requesting && !openPayout && (balance.available || 0) >= (payoutMin?.amountMinor || 0);

  return (
    <div className="space-y-5">
      {data.testMode && (
        <p className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider border border-amber-400/30 bg-amber-400/10 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
          ⚠️ TEST MODE — sandbox records only
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Earned" value={balance.earnedDisplay} />
        <StatCard icon={Wallet} label="Available" value={balance.availableDisplay} />
        <StatCard icon={Wallet} label="Paid out" value={formatMoneyOrDash(balance.paidOut, balance.currency)} />
        <StatCard icon={Wallet} label="Held" value={formatMoneyOrDash(balance.held, balance.currency)} />
      </div>
      <p className="text-[10px] font-mono text-zinc-600 -mt-2">
        All amounts are derived from verified payment events only — never estimated or faked.
      </p>

      {/* Payout request (MP24) — transparent threshold, single open request */}
      <div className="bg-[#0e0e0e] border border-[#1f1f1f] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-bold text-zinc-200">Request a payout</p>
          <p className="text-[10px] font-mono text-zinc-500">
            Minimum {payoutMin ? payoutMin.display : '$10.00'} · one request at a time
          </p>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Requesting moves your <span className="text-zinc-300">available</span> earnings into a pending payout. It is then
          processed after eligibility and provider verification — payouts are never instant by promise.
          Platform fee and processing fee are already deducted from every sale (see Revenue Share below).
        </p>
        {payoutMessage && (
          <p className={`text-[11px] font-mono leading-relaxed ${payoutMessage.tone === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {payoutMessage.text}
          </p>
        )}
        <button
          onClick={requestPayout}
          disabled={!canRequest}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {requesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
          {requesting ? 'Requesting…' : 'Request payout'}
        </button>
        {!canRequest && !requesting && (
          <p className="text-[10px] font-mono text-zinc-600">
            {openPayout
              ? 'A payout is already being processed — it must complete before you can request another.'
              : `Available balance must reach ${payoutMin ? payoutMin.display : '$10.00'} before you can request a payout.`}
          </p>
        )}
      </div>

      {/* Revenue share transparency (MP24, Section 9) */}
      <div className="bg-[#0e0e0e] border border-[#1f1f1f] rounded-2xl p-4 text-[11px] text-zinc-500 leading-relaxed">
        <p className="text-xs font-bold text-zinc-200 mb-1.5">Revenue share — how every sale splits</p>
        <p className="font-mono">
          Gross sale → payment processing fee → platform fee → your earnings.
        </p>
        <p className="mt-1">
          {data.revenueShare
            ? `On every sale you keep ${data.revenueShare.creatorNetPct}% (${data.revenueShare.platformFeePct}% platform fee + ${data.revenueShare.processingPct}% payment processing). Percentages are centralized policy, never hidden.`
            : 'You keep the largest share of every verified sale. The exact platform and processing percentages are centralized policy (never hidden) — see the platform documentation.'}
        </p>
      </div>

      <Card>
        <SectionTitle hint={`${sales.length || 0} recent`}>Recent sales</SectionTitle>
        {sales.length === 0 ? (
          <p className="text-xs text-zinc-500 py-6 text-center font-mono">No verified sales yet.</p>
        ) : (
          <div className="space-y-2">
            {sales.slice(0, 8).map((s, i) => (
              <div key={`${s.createdAt}-${i}`} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[#0e0e0e] border border-[#1f1f1f]">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{s.product || 'Sale'}</p>
                  <p className="text-[10px] font-mono text-zinc-600">{timeAgo(s.createdAt)}</p>
                </div>
                <p className="text-sm font-black text-emerald-400 font-mono shrink-0">+{s.display}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {payouts.length > 0 && (
        <Card>
          <SectionTitle>Payouts</SectionTitle>
          <div className="space-y-2">
            {payouts.map((p, i) => (
              <div key={`${p.createdAt}-${i}`} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[#0e0e0e] border border-[#1f1f1f]">
                <p className="text-xs text-zinc-300 font-mono">{timeAgo(p.createdAt)}</p>
                <p className="text-xs font-black font-mono">{p.display} · <span className="text-zinc-500 uppercase">{p.status}</span></p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function formatMoneyOrDash(minor, currency) {
  if (typeof minor !== 'number' || minor === 0) return '—';
  return (minor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
    minimumFractionDigits: 2,
  });
}

/**
 * ContentRow — one row of content performance.
 */
function ContentRow({ item, pinned = false, onPin, pinBusy = null, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const text = item.text || '';
  const preview = text.length > (compact ? 90 : 140) ? `${text.slice(0, compact ? 90 : 140)}…` : text;

  return (
    <div className="bg-[#0e0e0e] border border-[#1f1f1f] rounded-2xl p-3.5 hover:border-[#333] transition-colors">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#ff4d00]/10 text-[#ff4d00] border border-[#ff4d00]/20">
          {item.typeLabel || item.type}
        </span>
        <span className="text-[10px] font-mono text-zinc-600">{timeAgo(item.createdAt)}</span>
        {pinned && (
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 flex items-center gap-1">
            <Pin className="w-2.5 h-2.5" /> Featured
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => onPin(item.id)}
            disabled={pinBusy === item.id}
            aria-label={pinned ? 'Remove from profile' : 'Feature on profile'}
            title={pinned ? 'Remove from profile' : 'Feature on profile'}
            className={`p-1.5 rounded-lg transition-all disabled:opacity-40 ${
              pinned ? 'text-amber-400 hover:bg-amber-400/10' : 'text-zinc-600 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            {pinBusy === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
          <Link
            href={`/post/${item.id}`}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-[#1a1a1a] transition-all"
            aria-label="Open post"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-left w-full text-xs text-zinc-300 leading-relaxed"
        aria-expanded={expanded}
      >
        {expanded ? text : preview}
        {text.length > preview.length && (
          <span className="text-[#ff4d00] font-mono text-[10px] ml-1">{expanded ? 'show less' : 'more'}</span>
        )}
      </button>

      <div className="flex items-center gap-4 mt-2.5 text-[10px] font-mono text-zinc-500">
        <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-[#ff4d00]" /> {item.reactions || 0}</span>
        <span className="flex items-center gap-1">💬 {item.comments || 0}</span>
        <span className="flex items-center gap-1">⬆ {item.upvotes || 0}</span>
        {item.views !== null && item.views !== undefined && (
          <span className="flex items-center gap-1">👁 {item.views}</span>
        )}
      </div>
    </div>
  );
}
