'use client';

import React, { useState, useEffect } from 'react';
import { Shield, BarChart3, Users, Flame, Database, Trash2, Download, AlertTriangle, Star, TrendingUp, Clock, Eye, FlaskConical, Target, Activity, Zap, ChevronDown, ChevronUp, Play, Pause, Archive, RotateCcw } from 'lucide-react';
import { getAnalyticsEvents } from '@/lib/analytics';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAdminAuth } from '@/components/admin/useAdminAuth';
import AdminAccessLock from '@/components/admin/AdminAccessLock';

export default function AdminPage() {
  // Server-verified admin gate (MP26): the secret lives in memory only and
  // is attached to admin API calls — never compared or stored client-side.
  const { authenticated, secret, busy, error: gateError, unlock } = useAdminAuth();
  const [events, setEvents] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [roasts, setRoasts] = useState([]);
  const [reports, setReports] = useState([]);
  const [blockedIps, setBlockedIps] = useState([]);
  const [activeTab, setActiveTab] = useState('metrics');
  const [loading, setLoading] = useState(true);

  // Real computed stats
  const [roastsToday, setRoastsToday] = useState(0);
  const [topProfile, setTopProfile] = useState(null);
  const [recentRoasts, setRecentRoasts] = useState([]);

  // Growth Dashboard state
  const [funnelData, setFunnelData] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [guardrailData, setGuardrailData] = useState(null);
  const [growthLoading, setGrowthLoading] = useState(false);

  const loadData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    try {
      const [profsRes, rstsRes, repsRes, ipsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('roasts').select('*').order('created_at', { ascending: false }),
        supabase.from('reports').select('*').order('created_at', { ascending: false }),
        supabase.from('blocked_ips').select('*').order('created_at', { ascending: false }),
      ]);

      const profs = profsRes.data || [];
      const rsts = rstsRes.data || [];

      setProfiles(profs);
      setRoasts(rsts);
      setReports(repsRes.data || []);
      setBlockedIps(ipsRes.data || []);
      setEvents(getAnalyticsEvents());

      // Compute roasts today
      const today = new Date().toISOString().slice(0, 10);
      const todayRoasts = rsts.filter(r => r.created_at && r.created_at.startsWith(today));
      setRoastsToday(todayRoasts.length);

      // Top profile by roast count
      if (profs.length > 0) {
        const sorted = [...profs].sort((a, b) => (b.roast_count || 0) - (a.roast_count || 0));
        setTopProfile(sorted[0]);
      }

      // Recent roasts (last 10)
      setRecentRoasts(rsts.slice(0, 10));
    } catch (err) {
      console.error('[Admin] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load growth data (funnel + experiment management are admin-gated — MP26)
  const loadGrowthData = async () => {
    setGrowthLoading(true);
    try {
      const headers = { 'x-admin-password': secret };
      const [funnelRes, experimentsRes, guardrailsRes] = await Promise.all([
        fetch('/api/growth/events?days=30', { headers }).then(r => r.json()).catch(() => null),
        fetch('/api/experiments/manage', { headers }).then(r => r.json()).catch(() => null),
        fetch('/api/growth/guardrails').then(r => r.json()).catch(() => null),
      ]);

      if (funnelRes) setFunnelData(funnelRes);
      if (experimentsRes) setExperiments(experimentsRes.experiments || []);
      if (guardrailsRes) setGuardrailData(guardrailsRes);
    } catch (err) {
      console.error('[Admin] Growth data load error:', err);
    } finally {
      setGrowthLoading(false);
    }
  };

  // Load main dashboard data once the server has verified the admin secret.
  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    if (authenticated && secret && activeTab === 'growth') {
      loadGrowthData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, secret, activeTab]);

  const handleExportBackup = () => {
    const backup = {
      timestamp: new Date().toISOString(),
      stats: {
        totalProfiles: profiles.length,
        totalRoasts: roasts.length,
        roastsToday,
        topProfile: topProfile?.username || 'None',
      },
      profiles,
      roasts,
      reports,
      blockedIps,
      events,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `burnboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  // Staff-session proof for destructive writes: probes the moderator-gated
  // queue (403 unless the signed-in session is safety staff). The client
  // password flag alone never authorizes destruction.
  const verifyStaffSession = async () => {
    try {
      const res = await fetch('/api/safety/moderation?status=open&limit=1', { cache: 'no-store' });
      if (res.status === 401) {
        alert('Sign in with your staff account first.');
        return false;
      }
      if (res.status === 403) {
        alert('Staff permissions required for this action.');
        return false;
      }
      return res.ok;
    } catch {
      alert('Could not verify staff session. Try again.');
      return false;
    }
  };

  const handleDeleteRoast = async (id) => {
    if (!confirm('Delete this roast permanently?')) return;
    // Server-verified staff session first: the password flag alone never
    // authorizes destruction (RLS remains the database backstop).
    if (!(await verifyStaffSession())) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.from('roasts').delete().eq('id', id);
    }
    setRoasts(prev => prev.filter(r => r.id !== id));
    setRecentRoasts(prev => prev.filter(r => r.id !== id));
  };

  const handleDeleteProfile = async (id) => {
    if (!confirm('Delete this profile AND all its roasts permanently?')) return;
    if (!(await verifyStaffSession())) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.from('roasts').delete().eq('profile_id', id);
      await supabase.from('profiles').delete().eq('id', id);
    }
    setProfiles(prev => prev.filter(p => p.id !== id));
    setRoasts(prev => prev.filter(r => r.profile_id !== id));
  };

  const handleToggleFeature = async (id, currentFeatured) => {
    const nextVal = !currentFeatured;
    if (!(await verifyStaffSession())) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.from('profiles').update({ featured: nextVal }).eq('id', id);
    }
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, featured: nextVal } : p));
  };

  // Experiment lifecycle management
  const handleExperimentAction = async (experimentId, action) => {
    try {
      const res = await fetch('/api/experiments/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': secret },
        body: JSON.stringify({ id: experimentId, status: action }),
      });
      const data = await res.json();
      if (data.success) {
        loadGrowthData();
      } else {
        alert(data.error || 'Failed to update experiment');
      }
    } catch (err) {
      alert('Failed to update experiment');
    }
  };

  // Seed default experiments
  const handleSeedExperiments = async () => {
    try {
      const res = await fetch('/api/experiments/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': secret },
        body: JSON.stringify({ action: 'seed' }),
      });
      const data = await res.json();
      if (data.success) {
        loadGrowthData();
      }
    } catch (err) {
      alert('Failed to seed experiments');
    }
  };

  if (!authenticated) {
    return (
      <div className="bg-[#0a0a0a]">
        <AdminAccessLock title="Admin Console" busy={busy} error={gateError} onSubmit={unlock} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-mono">
        <div className="text-center space-y-3">
          <Flame className="w-8 h-8 text-[#ff4d00] animate-pulse mx-auto" />
          <p className="text-sm text-zinc-400 animate-pulse">Loading admin data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 font-mono max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-[#222] pb-4">
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-[#ff4d00]" />
          <div>
            <h1 className="text-lg font-bold">BURNBOARD Admin Dashboard</h1>
            <p className="text-xs text-zinc-400">Real data analytics • No fake stats</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f1610] text-[#ff4d00] border border-[#ff4d00]/30 rounded-xl text-xs font-bold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <div className="flex items-center gap-3">
            <a href="/admin/ai" className="text-xs text-zinc-400 hover:text-white">AI →</a>
            <a href="/admin/social" className="text-xs text-zinc-400 hover:text-white">Social →</a>
            <a href="/admin/security" className="text-xs text-zinc-400 hover:text-white">Security →</a>
            <a href="/admin/infrastructure" className="text-xs text-zinc-400 hover:text-white">Infrastructure →</a>
            <a href="/admin/financials" className="text-xs text-zinc-400 hover:text-white">Financial Observability →</a>
            <a href="/" className="text-xs text-zinc-400 hover:text-white">← Return to Feed</a>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto">
        {[
          { id: 'metrics', label: 'Metrics', icon: BarChart3 },
          { id: 'profiles', label: 'Profiles', icon: Users },
          { id: 'roasts', label: 'Roasts', icon: Flame },
          { id: 'events', label: 'Events', icon: Eye },
          { id: 'growth', label: 'Growth', icon: FlaskConical },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* METRICS TAB */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
              <div className="text-xs text-zinc-500 flex items-center gap-1"><Users className="w-3 h-3" /> Profiles</div>
              <div className="text-2xl font-bold text-white mt-1">{profiles.length}</div>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
              <div className="text-xs text-zinc-500 flex items-center gap-1"><Flame className="w-3 h-3" /> Total Roasts</div>
              <div className="text-2xl font-bold text-[#ff4d00] mt-1">{roasts.length}</div>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
              <div className="text-xs text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Roasts Today</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{roastsToday}</div>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
              <div className="text-xs text-zinc-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Reports</div>
              <div className="text-2xl font-bold text-red-400 mt-1">{reports.length}</div>
            </div>
          </div>

          {/* Top Profile */}
          {topProfile && (
            <div className="bg-gradient-to-r from-[#1c1200] to-[#111] border border-amber-500/30 rounded-xl p-5">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <Star className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Most Roasted Profile (Real Data)</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black ${topProfile.avatar_color || 'bg-[#ff4d00] text-black'}`}>
                    {topProfile.avatar_letter}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">@{topProfile.username}</h3>
                    <p className="text-xs text-zinc-400">{topProfile.platform} • {topProfile.bio}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-[#ff4d00]">{topProfile.roast_count || 0}</div>
                  <div className="text-[10px] text-zinc-500">roasts</div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {profiles.length === 0 && (
            <div className="bg-[#111] border border-dashed border-[#333] rounded-xl p-8 text-center">
              <Flame className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400 font-bold">No data yet — share your site!</p>
              <p className="text-xs text-zinc-500 mt-1">Profiles and roasts will appear here once users start submitting.</p>
            </div>
          )}
        </div>
      )}

      {/* PROFILES TAB */}
      {activeTab === 'profiles' && (
        <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase">All Profiles ({profiles.length})</h2>
          <div className="divide-y divide-[#222] max-h-96 overflow-y-auto">
            {profiles.map(p => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${p.avatar_color || 'bg-[#ff4d00] text-black'}`}>
                    {p.avatar_letter}
                  </div>
                  <div className="min-w-0">
                    <p className="text-zinc-200 font-bold truncate">@{p.username}</p>
                    <span className="text-zinc-500 text-[10px]">{p.platform} • {p.roast_count || 0} roasts • ▲ {p.total_upvotes || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleFeature(p.id, p.featured)}
                    className={`p-1.5 rounded ${p.featured ? 'bg-amber-900/40 text-amber-400' : 'bg-[#1a1a1a] text-zinc-500 hover:text-amber-400'}`}
                    title={p.featured ? 'Unfeature' : 'Feature'}
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(p.id)}
                    className="p-1.5 bg-red-950/40 text-red-400 rounded hover:bg-red-900/60"
                    title="Delete profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {profiles.length === 0 && <p className="text-zinc-500 text-xs py-2">No profiles submitted yet.</p>}
          </div>
        </div>
      )}

      {/* ROASTS TAB */}
      {activeTab === 'roasts' && (
        <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase">Recent Roasts ({roasts.length})</h2>
          <div className="divide-y divide-[#222] max-h-96 overflow-y-auto">
            {recentRoasts.map(r => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <p className="text-zinc-200">&ldquo;{r.roast_text}&rdquo;</p>
                  <span className="text-zinc-500 text-[10px]">by {r.anon_id} • ▲ {r.upvotes} upvotes • {r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                </div>
                <button
                  onClick={() => handleDeleteRoast(r.id)}
                  className="p-1.5 bg-red-950/40 text-red-400 rounded hover:bg-red-900/60 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {recentRoasts.length === 0 && <p className="text-zinc-500 text-xs py-2">No roasts found.</p>}
          </div>
        </div>
      )}

      {/* EVENTS TAB */}
      {activeTab === 'events' && (
        <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase">Analytics Events ({events.length})</h2>
          <div className="divide-y divide-[#222] max-h-96 overflow-y-auto">
            {events.slice(0, 50).map((evt, i) => (
              <div key={i} className="py-2 text-xs">
                <span className="text-[#ff4d00] font-bold">{evt.event}</span>
                {evt.data && Object.keys(evt.data).length > 0 && (
                  <span className="text-zinc-500 ml-2">{JSON.stringify(evt.data)}</span>
                )}
                <span className="text-zinc-600 ml-2">{evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-zinc-500 text-xs py-2">No analytics events tracked yet.</p>}
          </div>
        </div>
      )}

      {/* GROWTH DASHBOARD TAB */}
      {activeTab === 'growth' && (
        <div className="space-y-6">
          {growthLoading && (
            <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center">
              <Activity className="w-6 h-6 text-[#ff4d00] animate-pulse mx-auto mb-2" />
              <p className="text-xs text-zinc-400">Loading growth data...</p>
            </div>
          )}

          {!growthLoading && (
            <>
              {/* Growth Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                  <div className="text-xs text-zinc-500 flex items-center gap-1"><Target className="w-3 h-3" /> Funnel Events</div>
                  <div className="text-2xl font-bold text-white mt-1">{funnelData?.totalEvents || 0}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Last 30 days</div>
                </div>
                <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                  <div className="text-xs text-zinc-500 flex items-center gap-1"><FlaskConical className="w-3 h-3" /> Experiments</div>
                  <div className="text-2xl font-bold text-[#ff4d00] mt-1">{experiments.length}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{experiments.filter(e => e.status === 'active').length} active</div>
                </div>
                <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                  <div className="text-xs text-zinc-500 flex items-center gap-1"><Zap className="w-3 h-3" /> Client Events</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">{events.length}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">localStorage</div>
                </div>
                <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                  <div className="text-xs text-zinc-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Guardrails</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">{guardrailData?.supportedMetrics?.length || 7}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Monitored</div>
                </div>
              </div>

              {/* Activation Funnel */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#ff4d00]" />
                    Growth Funnel
                  </h2>
                  <button
                    onClick={loadGrowthData}
                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {funnelData?.funnel && funnelData.funnel.length > 0 ? (
                  <div className="space-y-2">
                    {funnelData.funnel.map((step, i) => (
                      <div key={step.event} className="flex items-center gap-3">
                        <div className="w-48 text-xs text-zinc-300 font-mono truncate">{step.event}</div>
                        <div className="flex-1 bg-[#0a0a0a] rounded-full h-6 relative overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#ff4d00] to-[#ff6622] rounded-full transition-all duration-500"
                            style={{
                              width: funnelData.funnel[0].count > 0
                                ? `${Math.max(2, (step.count / funnelData.funnel[0].count) * 100)}%`
                                : '2%'
                            }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                            {step.count}
                          </span>
                        </div>
                        <div className="w-20 text-right text-[10px] text-zinc-500">
                          {step.rateFromTop || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500 text-xs">
                    <Target className="w-6 h-6 mx-auto mb-2 text-zinc-600" />
                    No funnel events recorded yet. Events will appear as users interact with the product.
                  </div>
                )}
              </div>

              {/* Experiments Management */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-[#ff4d00]" />
                    Experiments
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSeedExperiments}
                      className="text-[10px] px-2 py-1 bg-[#1f1610] text-[#ff4d00] border border-[#ff4d00]/30 rounded-lg font-bold"
                    >
                      Seed Defaults
                    </button>
                    <button
                      onClick={loadGrowthData}
                      className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                </div>

                {experiments.length > 0 ? (
                  <div className="space-y-3">
                    {experiments.map(exp => (
                      <div key={exp.id} className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              exp.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                              exp.status === 'draft' ? 'bg-zinc-500/20 text-zinc-400' :
                              exp.status === 'paused' ? 'bg-amber-500/20 text-amber-400' :
                              exp.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-zinc-500/10 text-zinc-500'
                            }`}>
                              {exp.status}
                            </span>
                            <span className="text-xs font-bold text-white">{exp.name}</span>
                            <span className="text-[10px] text-zinc-500">({exp.key})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {exp.status === 'draft' && (
                              <button
                                onClick={() => handleExperimentAction(exp.id, 'active')}
                                className="p-1 bg-emerald-900/40 text-emerald-400 rounded hover:bg-emerald-900/60"
                                title="Activate"
                              >
                                <Play className="w-3 h-3" />
                              </button>
                            )}
                            {exp.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleExperimentAction(exp.id, 'paused')}
                                  className="p-1 bg-amber-900/40 text-amber-400 rounded hover:bg-amber-900/60"
                                  title="Pause"
                                >
                                  <Pause className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleExperimentAction(exp.id, 'completed')}
                                  className="p-1 bg-blue-900/40 text-blue-400 rounded hover:bg-blue-900/60"
                                  title="Complete"
                                >
                                  <Archive className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {exp.status === 'paused' && (
                              <button
                                onClick={() => handleExperimentAction(exp.id, 'active')}
                                className="p-1 bg-emerald-900/40 text-emerald-400 rounded hover:bg-emerald-900/60"
                                title="Resume"
                              >
                                <Play className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {exp.description && (
                          <p className="text-[10px] text-zinc-400 mb-2">{exp.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          <span className="text-zinc-500">Variants:</span>
                          {(exp.variants || []).map((v, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-[#1a1a1a] rounded text-zinc-300 border border-[#262626]">
                              {v}
                            </span>
                          ))}
                        </div>
                        {exp.primary_metric && (
                          <div className="text-[10px] text-zinc-500 mt-1">
                            Primary: <span className="text-zinc-300">{exp.primary_metric}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500 text-xs">
                    <FlaskConical className="w-6 h-6 mx-auto mb-2 text-zinc-600" />
                    No experiments configured. Click &quot;Seed Defaults&quot; to create starter experiments.
                  </div>
                )}
              </div>

              {/* Guardrails */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Guardrail Metrics
                </h2>
                <p className="text-[10px] text-zinc-400">
                  Experiments must not improve one metric while damaging the product. These guardrails are monitored automatically.
                </p>
                {guardrailData?.thresholds ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(guardrailData.thresholds).map(([metric, threshold]) => (
                      <div key={metric} className="bg-[#0a0a0a] border border-[#222] rounded-xl p-3">
                        <div className="text-xs font-bold text-zinc-300 mb-1">{metric.replace(/_/g, ' ')}</div>
                        <div className="text-[10px] text-zinc-500">
                          Max: <span className="text-amber-400">{threshold.max}{threshold.unit}</span>
                        </div>
                        <div className="mt-2 w-full bg-[#1a1a1a] rounded-full h-1.5">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: '15%' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-zinc-500 text-xs">
                    Guardrail thresholds loaded from API.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
