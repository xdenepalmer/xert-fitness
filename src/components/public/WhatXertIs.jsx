import React from 'react';

const LOGO_ICON = '/assets/xert-logo-mark-light.png';

const trainingSystem = [
  {
    label: 'Structured Functional Fitness Training Classes',
    desc: 'Every class follows intentional programming for strength, conditioning, movement quality and overall fitness. Training blocks build toward events across the year so progress is measured, tested and shared.',
    note: 'No random workouts. Every session has purpose.',
  },
  {
    label: 'Accessory Training',
    desc: 'A dedicated area supports extra accessory work before or after class, or as a substitute during class times. Monthly programs help members build specific strength and conditioning for their goals.',
    note: 'Extra support without losing structure.',
  },
  {
    label: 'Health, Performance, Recovery and Nutrition',
    desc: 'Members can work with qualified personal trainers, nutrition support and allied health professionals to build a more personal plan around performance, recovery and long-term progress.',
    note: 'Individual goals, backed by the right support.',
  },
];

export default function WhatXertIs() {
  return (
    <section className="bg-xert-navy px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 grid grid-cols-1 items-start gap-8 sm:mb-14 lg:grid-cols-2 lg:gap-12">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px w-6 bg-xert-steel" />
              <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">The XERT Training System</span>
            </div>
            <h2 className="mb-6 font-display uppercase text-xert-offwhite"
              style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', lineHeight: 0.95 }}>
              Purposeful.<br />
              <span className="text-xert-steel">Progressive.</span><br />
              Sustainable.
            </h2>
            {/* Horizontal rule with icon */}
            <div className="flex items-center gap-4">
              <div aria-hidden="true" className="xert-divider flex-1" />
              <img src={LOGO_ICON} alt="" loading="lazy" decoding="async" width="712" height="412" className="h-6 w-auto opacity-60" />
              <div aria-hidden="true" className="xert-divider flex-1" />
            </div>
          </div>

          <div className="max-w-[44ch]">
            <p className="mb-4 font-body text-base leading-relaxed text-xert-pale">
              XERT Fitness was created to provide structured, coach-led functional fitness training in a supportive, performance-focused environment.
            </p>
            <p className="mb-4 font-body text-[0.9375rem] leading-relaxed text-xert-pale/70">
              Every session is programmed with intent and delivered through a booking-based semi-private coaching model designed to help members train consistently, move better and improve performance over time.
            </p>
            <p className="font-body text-[0.9375rem] leading-relaxed text-xert-pale/60">
              Whether you are starting your fitness journey or preparing for your next event, XERT provides coaching that meets you where you are.
            </p>
          </div>
        </div>

        {/* Training system grid */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          {trainingSystem.map((p, i) => (
            <div key={i} className="xert-card flex flex-col p-5 sm:p-6">
              <span className="xert-chip mb-5 self-start tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="mb-3 font-display text-xl uppercase leading-tight text-xert-offwhite">{p.label}</p>
              <p className="flex-1 font-body text-sm leading-relaxed text-xert-pale/70">{p.desc}</p>
              <div aria-hidden="true" className="xert-divider mt-5" />
              <p className="pt-4 font-body text-xs uppercase tracking-wider text-xert-steel">
                {p.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
