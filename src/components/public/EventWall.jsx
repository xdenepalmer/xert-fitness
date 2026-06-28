import React, { useRef } from 'react';

const eventCategories = [
  'Functional fitness events',
  'Team challenges',
  'Endurance races',
  'Obstacle / challenge events',
  'Local comps',
  'Charity fitness events',
  'Military-style endurance challenges',
];

export default function EventWall() {
  const stripRef = useRef(null);

  return (
    <section className="relative bg-xert-ink overflow-hidden py-20">
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#F4F0E8 1px, transparent 1px), linear-gradient(90deg, #F4F0E8 1px, transparent 1px)',
          backgroundSize: '80px 80px'
        }}
      />

      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-xert-red to-xert-orange" />

      <div className="relative max-w-5xl mx-auto px-6">
        {/* Label */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6 bg-xert-orange" />
          <span className="font-body text-xs text-xert-orange uppercase tracking-[0.2em]">The Goal</span>
        </div>

        {/* Headline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-tight text-xert-offwhite uppercase">
              Train toward<br />
              <span className="text-xert-orange">something.</span>
            </h2>
          </div>
          <div className="flex flex-col justify-end">
            <p className="font-body text-base text-xert-concrete/70 leading-relaxed mb-6">
              Most people train harder when there is something ahead of them. XERT will build around a calendar of functional fitness, endurance, team and challenge events. Members can choose a goal, understand what it requires and train with more purpose.
            </p>
            <a href="#eoi"
              className="inline-flex items-center gap-2 font-body text-sm text-xert-orange hover:text-xert-offwhite transition-colors group">
              <span>Tell us what you'd train for</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </a>
          </div>
        </div>

        {/* Event category horizontal strip */}
        <div
          ref={stripRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-4 -mx-2 px-2"
        >
          {eventCategories.map((cat, i) => (
            <div
              key={i}
              className="flex-shrink-0 px-4 py-3 border border-xert-steel/40 hover:border-xert-orange transition-colors cursor-default"
            >
              <span className="font-body text-sm text-xert-concrete/80 whitespace-nowrap">{cat}</span>
            </div>
          ))}
        </div>
        <p className="font-body text-xs text-xert-concrete/30 mt-3 text-center lg:text-left">Scroll to see all event categories</p>
      </div>
    </section>
  );
}