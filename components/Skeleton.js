import React from 'react';

export function ProfileCardSkeleton() {
  return (
    <div className="glass-soft rounded-2xl p-5 space-y-4" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="glass-skeleton h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <div className="glass-skeleton h-4 w-32" />
            <div className="glass-skeleton h-3 w-20" />
          </div>
        </div>
        <div className="glass-skeleton h-6 w-16 rounded-lg" />
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="glass-skeleton h-3 w-full" />
        <div className="glass-skeleton h-3 w-4/5" />
      </div>
    </div>
  );
}

export function RoastItemSkeleton() {
  return (
    <div className="glass-soft rounded-2xl p-4 space-y-3" aria-busy="true" aria-label="Loading roast">
      <div className="flex items-center justify-between">
        <div className="glass-skeleton h-4 w-24" />
        <div className="glass-skeleton h-3 w-16" />
      </div>
      <div className="glass-skeleton h-4 w-full" />
      <div className="glass-skeleton h-4 w-2/3" />
    </div>
  );
}

export function GlassCardSkeleton({ lines = 3, className = '' }) {
  return (
    <div className={`glass-soft rounded-2xl p-4 space-y-2.5 ${className}`} aria-busy="true" aria-label="Loading content">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="glass-skeleton h-3.5" style={{ width: `${100 - i * 14}%` }} />
      ))}
    </div>
  );
}
