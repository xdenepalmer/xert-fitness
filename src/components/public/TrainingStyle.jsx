import React from 'react';

const pillars = [
  { label: 'Functional Strength', desc: 'Movement patterns that transfer to real life and sport.' },
  { label: 'Conditioning', desc: 'Engine work. Capacity built over time, not in a single session.' },
  { label: 'Endurance', desc: 'Sustained output. Building the base for events and long days.' },
  { label: 'Movement Quality', desc: 'Standards matter. Getting it right before adding load.' },
  { label: 'Scalable Classes', desc: 'Every class can be adjusted. You work at your level.' },
  { label: 'Team Training', desc: 'Shared goals, shared effort. Community built through work.' },
  { label: 'Personal Training', desc: 'Private sessions for focused progress and individual coaching.' },
  { label: 'Event Readiness', desc: 'Training with a goal on the calendar changes everything.' },
];

export default function TrainingStyle() {
  return (
    <section className="bg-xert-charcoal py-20 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Label */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6 bg-xert-red" />
          <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Training Style</span>
        </div>

        {/* Headline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-2">
            <h2 className="font-display text-[clamp(2rem,5vw,3.8rem)] leading-tight text-xert-offwhite uppercase">
              Strength.<br />Engine.<br />
              <span className="text-xert-red">Standards.</span>
            </h2>
          </div>
          <div className="flex items-end">
            <p className="font-display text-xl text-xert-concrete/60 uppercase">
              Serious training,<br />made accessible.
            </p>
          </div>
        </div>

        {/* Pillar grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-xert-steel/20">
          {pillars.map((p, i) => (
            <div key={i} className="bg-xert-charcoal p-6 hover:bg-xert-ink transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-display text-xs text-xert-red uppercase tracking-widest">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="font-display text-lg text-xert-offwhite uppercase mb-2">{p.label}</h3>
              <p className="font-body text-xs text-xert-concrete/60 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}