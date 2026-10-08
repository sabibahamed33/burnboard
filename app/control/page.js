'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity, Shield, Flag, Users, ScrollText, ToggleLeft, Siren,
  TrendingUp, Wallet, HeartPulse, FlaskConical, MessagesSquare, Swords, Trophy, FolderKanban,
} from 'lucide-react';

/**
 * /control — hub mapping all 18 operational areas.
 * Existing working surfaces are linked (never duplicated); new pages are
 * built where capability was missing. Everything behind staff auth.
 */

const AREAS = [
  { title: 'Platform Overview', desc: 'Real-time operational metrics from live data.', href: '/control/overview', icon: Activity, tag: 'new' },
  { title: 'Moderation Queue', desc: 'Reports, content actions, user enforcement.', href: '/admin/moderation', icon: Shield, tag: 'existing' },
  { title: 'Reports', desc: 'Same queue, report-focused triage.', href: '/admin/moderation', icon: Flag, tag: 'existing' },
  { title: 'Users', desc: 'Least-privilege lookup + restriction state.', href: '/control/users', icon: Users, tag: 'new' },
  { title: 'Content', desc: 'Public content inspection via existing surfaces.', href: '/explore', icon: FolderKanban, tag: 'existing' },
  { title: 'Communities', desc: 'Community management + moderation.', href: '/c', icon: Users, tag: 'existing' },
  { title: 'Battles', desc: 'Battle operations + voting integrity.', href: '/battle', icon: Swords, tag: 'existing' },
  { title: 'Challenges', desc: 'Challenge operations.', href: '/challenges', icon: Trophy, tag: 'existing' },
  { title: 'Messaging Safety', desc: 'DM reports land in the moderation queue.', href: '/admin/moderation', icon: MessagesSquare, tag: 'existing' },
  { title: 'Abuse & Spam', desc: 'Security signals + velocity monitoring.', href: '/admin/security', icon: Shield, tag: 'existing' },
  { title: 'Analytics', desc: 'Engagement, retention, funnels, experiments.', href: '/admin/growth', icon: TrendingUp, tag: 'existing' },
  { title: 'Growth', desc: 'Referrals, invites, deep links, sharing.', href: '/admin/growth', icon: TrendingUp, tag: 'existing' },
  { title: 'Subscriptions', desc: 'Real billing ledger observability.', href: '/admin/financials', icon: Wallet, tag: 'existing' },
  { title: 'System Health', desc: 'App, database, queues, cache signals.', href: '/control/health', icon: HeartPulse, tag: 'new' },
  { title: 'Audit Logs', desc: 'Immutable privileged-action trail.', href: '/control/audit', icon: ScrollText, tag: 'new' },
  { title: 'Feature Flags', desc: 'Effective flag inventory (read-only).', href: '/control/flags', icon: ToggleLeft, tag: 'new' },
  { title: 'Incidents', desc: 'SEV tracking with timeline + resolution.', href: '/control/incidents', icon: Siren, tag: 'new' },
  { title: 'Settings', desc: 'Admin configuration + AI ops.', href: '/admin', icon: FlaskConical, tag: 'existing' },
];

export default function ControlHubPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-xl font-black text-white">Platform Control Center</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Internal operations only. Every privileged action is authorization-checked
          server-side and audit-logged. Nothing here is visible to ordinary users —
          every public account remains simply a <span className="font-semibold text-zinc-200">user</span>.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.title}
              href={a.href}
              className="group flex min-h-[88px] flex-col justify-between gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/25 hover:bg-white/[0.06]"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <Icon className="h-4 w-4 text-zinc-400 group-hover:text-white" />
                {a.title}
              </span>
              <span className="text-xs leading-relaxed text-zinc-500">{a.desc}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
