import React from 'react';
import FadeImage from '@/components/public/FadeImage';

const PHOTO = '/assets/training-philosophy.jpg';

export default function FounderSection() {
  return (
    <section className="xert-glow-center relative overflow-hidden bg-xert-navy px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <div className="h-px w-6 bg-xert-steel" />
          <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Philosophy</span>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <h2 className="mb-6 font-display uppercase text-xert-offwhite"
              style={{ fontSize: 'clamp(2rem,5vw,3.5rem)', lineHeight: 0.95 }}>
              Train for life.<br />
              <span className="text-xert-pale/50">Compete for fun.</span>
            </h2>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {['Real-world events', 'Sustainable progress', 'Community accountability'].map(b => (
                <span key={b} className="xert-chip">
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="relative mb-6 aspect-video overflow-hidden rounded-2xl border border-xert-steel/15 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)]">
              <FadeImage src={PHOTO} alt="Training at XERT" className="w-full h-full object-cover"
                style={{ filter: 'saturate(0.6) brightness(0.7)' }} />
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(16,24,32,0.55) 100%)' }} />
            </div>

            <p className="max-w-[44ch] font-body text-base leading-relaxed text-xert-pale">
              XERT is built around preparing members for real-world events, from local sport to endurance racing, functional fitness competitions and personal challenges.
            </p>
            <p className="mt-4 max-w-[44ch] font-body text-[0.9375rem] leading-relaxed text-xert-pale/70">
              Training is purposeful, progressive and sustainable. Members choose the events that matter to them, train together and build toward shared goals throughout the year.
            </p>
            <div aria-hidden="true" className="xert-divider mt-6" />
            <p className="pt-4 font-display text-sm uppercase tracking-widest text-xert-pale/35">
              Beat Your Best.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
