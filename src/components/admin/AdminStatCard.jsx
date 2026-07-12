import React from 'react';

export default function AdminStatCard({ label, value, sub = null, accent = false, loading = false, icon: Icon }) {
  return (
    <div
      className="relative p-5 overflow-hidden transition-all group"
      style={{
        background: accent
          ? 'linear-gradient(145deg, rgba(123,167,188,0.16) 0%, rgba(16,24,32,0.6) 70%)'
          : 'linear-gradient(145deg, rgba(50,72,90,0.22) 0%, rgba(16,24,32,0.55) 70%)',
        border: `1px solid ${accent ? 'rgba(123,167,188,0.45)' : 'rgba(123,167,188,0.16)'}`,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.55)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = accent ? 'rgba(123,167,188,0.45)' : 'rgba(123,167,188,0.16)'}
    >
      {/* Corner tick */}
      <div className="absolute top-0 right-0 w-6 h-6 pointer-events-none"
        style={{ borderTop: '1px solid rgba(123,167,188,0.35)', borderRight: '1px solid rgba(123,167,188,0.35)' }} />

      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: accent ? '#7BA7BC' : 'rgba(123,167,188,0.55)' }} />}
        <p className="font-body text-[11px] uppercase tracking-[0.14em]" style={{ color: 'rgba(209,221,230,0.45)' }}>{label}</p>
      </div>

      {loading ? (
        <div className="h-9 w-20 animate-pulse" style={{ backgroundColor: 'rgba(50,72,90,0.5)' }} />
      ) : (
        <p className="font-display text-4xl tabular-nums leading-none"
          style={{ color: accent ? '#7BA7BC' : '#F1F3F4' }}>
          {value ?? '—'}
        </p>
      )}
      {sub && <p className="font-body text-xs mt-2" style={{ color: 'rgba(209,221,230,0.35)' }}>{sub}</p>}
    </div>
  );
}
