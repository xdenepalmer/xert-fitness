import React from 'react';
import FadeImage from '@/components/public/FadeImage';

const PHOTO = '/assets/training-style.jpg';

const pillars = [
  { label: 'Functional Movement', desc: 'Strength, power and conditioning built on real-world patterns.' },
  { label: 'Structured Programming', desc: 'Classes follow progressive 12-week training blocks.' },
  { label: 'Event-Led Training', desc: 'The 2026 event calendar gives members real goals.' },
  { label: 'All Levels Welcome', desc: 'From first-timers to experienced athletes.' },
  { label: 'Coach-Led Classes', desc: 'No guesswork — your coach leads every session.' },
  { label: 'Allied Health Integration', desc: 'Recovery and support built into the facility.' },
];

export default function TrainingStyle() {
  return (
    <section className="relative bg-xert-navy px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        {/* Header with photo */}
        <div className="mb-10 grid grid-cols-1 items-center gap-8 sm:mb-14 lg:grid-cols-2 lg:gap-10">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px w-6 bg-xert-steel" />
              <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">How We Train</span>
            </div>
            <h2 className="mb-6 font-display uppercase text-xert-offwhite"
              style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 0.95 }}>
              Structure.<br />
              <span className="text-xert-steel">Purpose.</span><br />
              Performance.
            </h2>
            <p className="max-w-[44ch] font-body text-[0.9375rem] leading-relaxed text-xert-pale/70">
              XERT is not a commercial gym. Every session is coached, programmed and built around helping members improve, whether the goal is general fitness, event preparation, strength or long-term health.
            </p>
          </div>
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-xert-steel/15 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)] lg:aspect-square">
            <FadeImage src={PHOTO} alt="Training at XERT" className="w-full h-full object-cover"
              style={{ filter: 'saturate(0.65) brightness(0.7)' }} />
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, rgba(16,24,32,0.5) 0%, transparent 60%)' }} />
            {/* Beat your best overlay */}
            <div className="absolute bottom-4 left-5">
              <p className="font-display text-2xl uppercase text-xert-pale/60">Beat Your Best</p>
            </div>
          </div>
        </div>

        {/* Pillars */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {pillars.map((p, i) => (
            <div key={i} className="xert-card-flat p-4 sm:p-5">
              <div className="mb-1.5 flex items-center gap-2.5">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-xert-steel" />
                <p className="font-display text-base uppercase text-xert-offwhite">{p.label}</p>
              </div>
              <p className="font-body text-sm text-xert-pale/60">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
