import React from 'react';

const LOGO_ICON = '/assets/xert-logo-icon.png';

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
    <section className="py-20 px-6" style={{ backgroundColor: '#101820' }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>The XERT Training System</span>
            </div>
            <h2 className="font-display text-xert-offwhite uppercase mb-6"
              style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', lineHeight: 0.95 }}>
              Purposeful.<br />
              <span style={{ color: '#7BA7BC' }}>Progressive.</span><br />
              Sustainable.
            </h2>
            {/* Horizontal rule with icon */}
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }} />
              <img src={LOGO_ICON} alt="" className="h-6 w-auto opacity-60"
                style={{ filter: 'brightness(0) invert(1)' }} />
              <div className="h-px flex-1" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }} />
            </div>
          </div>

          <div>
            <p className="font-body leading-relaxed mb-4" style={{ color: '#D1DDE6', fontSize: '1rem' }}>
              XERT Fitness was created to provide structured, coach-led functional fitness training in a supportive, performance-focused environment.
            </p>
            <p className="font-body leading-relaxed mb-4" style={{ color: 'rgba(209,221,230,0.7)', fontSize: '0.9375rem' }}>
              Every session is programmed with intent and delivered through a booking-based semi-private coaching model designed to help members train consistently, move better and improve performance over time.
            </p>
            <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.6)', fontSize: '0.9375rem' }}>
              Whether you are starting your fitness journey or preparing for your next event, XERT provides coaching that meets you where you are.
            </p>
          </div>
        </div>

        {/* Training system grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {trainingSystem.map((p, i) => (
            <div key={i} className="p-6 border transition-colors flex flex-col"
              style={{ borderColor: 'rgba(123,167,188,0.15)', backgroundColor: 'rgba(50,72,90,0.2)' }}>
              <span className="font-display text-sm tabular-nums mb-5" style={{ color: 'rgba(123,167,188,0.55)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="font-display text-xert-offwhite uppercase text-xl leading-tight mb-3">{p.label}</p>
              <p className="font-body text-sm leading-relaxed flex-1" style={{ color: 'rgba(209,221,230,0.66)' }}>{p.desc}</p>
              <p className="font-body text-xs uppercase tracking-wider mt-5 pt-4 border-t" style={{ borderColor: 'rgba(123,167,188,0.16)', color: '#7BA7BC' }}>
                {p.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
