import React from 'react';

/**
 * Dashboard figure with its label. Accent cards carry the steel tint used for
 * the number the owner should look at first.
 */
export default function AdminStatCard({ label, value, sub = null, accent = false, loading = false, icon: Icon }) {
  return (
    <div
      className={`group relative overflow-hidden p-5 transition-colors border ${
        accent
          ? 'border-xert-steel/45 bg-gradient-to-br from-xert-steel/15 to-xert-navy/60 hover:border-xert-steel/55'
          : 'border-xert-steel/15 bg-gradient-to-br from-xert-deep/20 to-xert-navy/55 hover:border-xert-steel/55'
      }`}
    >
      {/* Corner tick */}
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-6 w-6 border-r border-t border-xert-steel/35" />

      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className={`h-3.5 w-3.5 ${accent ? 'text-xert-steel' : 'text-xert-steel/55'}`} />}
        <p className="font-body text-[11px] uppercase tracking-[0.14em] text-xert-pale/45">{label}</p>
      </div>

      {loading ? (
        <div className="h-9 w-20 animate-pulse bg-xert-deep/50" />
      ) : (
        <p className={`font-display text-4xl leading-none tabular-nums ${accent ? 'text-xert-steel' : 'text-xert-offwhite'}`}>
          {value ?? '—'}
        </p>
      )}
      {sub && <p className="mt-2 font-body text-xs text-xert-pale/35">{sub}</p>}
    </div>
  );
}
