import React from 'react';

const WORDS = ['Beat Your Best', 'Structure', 'Performance', 'Discipline', 'Event Ready', 'Resilience', 'Kingaroy QLD'];

/**
 * Infinite horizontal marquee band — strong dynamic movement,
 * architectural divider between sections.
 */
export default function Marquee() {
  const items = [...WORDS, ...WORDS];

  return (
    <div className="relative overflow-hidden border-y border-xert-steel/10 bg-xert-ink py-4 sm:py-5">
      <div className="xert-marquee-track flex whitespace-nowrap">
        {items.map((w, i) => (
          <span key={i} className="flex items-center shrink-0">
            <span
              className="font-display text-2xl sm:text-3xl uppercase tracking-tight mx-6"
              style={{ color: i % 2 === 0 ? '#D1DDE6' : 'rgba(123,167,188,0.45)' }}
            >
              {w}
            </span>
            <span className="w-1.5 h-1.5 rounded-full mx-2 bg-xert-steel" />
          </span>
        ))}
      </div>
      {/* Edge fades */}
      <div className="absolute inset-y-0 left-0 w-24" style={{ background: 'linear-gradient(90deg, #0d1720, transparent)' }} />
      <div className="absolute inset-y-0 right-0 w-24" style={{ background: 'linear-gradient(270deg, #0d1720, transparent)' }} />
    </div>
  );
}
