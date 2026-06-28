import React from 'react';

export default function AdminStatCard({ label, value, sub, accent = false, loading = false }) {
  return (
    <div className={`bg-xert-ink border ${accent ? 'border-xert-red/40' : 'border-xert-steel/20'} p-5`}>
      <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-3">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-xert-charcoal animate-pulse" />
      ) : (
        <p className={`font-display text-4xl tabular-nums ${accent ? 'text-xert-red' : 'text-xert-offwhite'}`}>{value ?? '—'}</p>
      )}
      {sub && <p className="font-body text-xs text-xert-concrete/40 mt-2">{sub}</p>}
    </div>
  );
}