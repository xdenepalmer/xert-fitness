import React from 'react';

const audiences = [
  { group: 'Emergency services', descriptor: 'Shift-ready strength and conditioning.' },
  { group: 'Mine workers', descriptor: 'Durable strength and engine.' },
  { group: 'Teachers', descriptor: 'Structured training around busy workdays.' },
  { group: 'Hospital workers', descriptor: 'Community and accountability.' },
  { group: 'Council / government workers', descriptor: 'Consistent training structure.' },
  { group: 'Local sports teams', descriptor: 'Team conditioning and fitness blocks.' },
  { group: 'Beginners', descriptor: 'Coached from the start.' },
  { group: 'Experienced athletes', descriptor: 'Stronger standards and event goals.' },
];

export default function AudienceRows() {
  return (
    <section className="py-20 px-6" style={{ backgroundColor: '#0d1720' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Who It's For</span>
        </div>

        <h2 className="font-display uppercase mb-10"
          style={{ fontSize: 'clamp(2rem,5vw,3rem)', lineHeight: 0.95, color: '#F1F3F4' }}>
          Built for Kingaroy.<br />
          <span style={{ color: 'rgba(209,221,230,0.45)' }}>All of it.</span>
        </h2>

        <div>
          {audiences.map((a, i) => (
            <div key={i}
              className="flex items-center gap-6 py-4 border-b transition-colors group"
              style={{ borderColor: 'rgba(123,167,188,0.12)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.35)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.12)'}>
              <span className="font-display text-xs tabular-nums w-6 shrink-0" style={{ color: 'rgba(123,167,188,0.4)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="font-display text-xl uppercase text-xert-offwhite transition-colors group-hover:text-xert-pale"
                  style={{ letterSpacing: '0.01em' }}>
                  {a.group}
                </span>
                <span className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.45)' }}>
                  {a.descriptor}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}