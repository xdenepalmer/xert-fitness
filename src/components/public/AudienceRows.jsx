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
    <section className="bg-xert-black py-20 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Label */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6 bg-xert-red" />
          <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Who it's for</span>
        </div>

        <h2 className="font-display text-[clamp(2rem,5vw,3rem)] leading-tight text-xert-offwhite uppercase mb-10">
          Built for Kingaroy.<br />
          <span className="text-xert-concrete/50">All of it.</span>
        </h2>

        <div className="space-y-0">
          {audiences.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-6 py-4 border-b border-xert-steel/20 group hover:border-xert-red/40 transition-colors"
            >
              <span className="font-display text-xs text-xert-steel tabular-nums w-6 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="font-display text-lg sm:text-xl text-xert-offwhite uppercase group-hover:text-xert-red transition-colors">
                  {a.group}
                </span>
                <span className="font-body text-sm text-xert-concrete/50 sm:text-right">
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