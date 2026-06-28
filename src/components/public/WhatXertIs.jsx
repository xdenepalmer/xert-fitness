import React from 'react';

const LOGO_ICON = 'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/5e7804bee_Asset1.png';

const pillars = [
  { label: 'Structured Classes', desc: 'Coached, programmed, purposeful.' },
  { label: 'Personal Training', desc: '1-on-1 coaching around your goals.' },
  { label: 'Event Preparation', desc: 'Train toward a goal that matters.' },
  { label: 'Allied Health', desc: 'Physio, nutrition, recovery on-site.' },
  { label: 'Community', desc: 'People who train with purpose.' },
  { label: 'Education', desc: 'Understand your training.' },
];

export default function WhatXertIs() {
  return (
    <section className="py-20 px-6" style={{ backgroundColor: '#101820' }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>What XERT Is</span>
            </div>
            <h2 className="font-display text-xert-offwhite uppercase mb-6"
              style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', lineHeight: 0.95 }}>
              Not a gym.<br />
              <span style={{ color: '#7BA7BC' }}>A training facility.</span>
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
              XERT is built on discipline, structure and purpose. It encourages performance, resilience and a strong sense of community.
            </p>
            <p className="font-body leading-relaxed mb-4" style={{ color: 'rgba(209,221,230,0.7)', fontSize: '0.9375rem' }}>
              Unlike commercial gyms, XERT runs structured classes with proper coaching, programming that builds toward real goals, and a calendar of fitness events so members always have something to train toward.
            </p>
            <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.6)', fontSize: '0.9375rem' }}>
              Allied health practitioners — physios, nutritionists, psychologists — operate inside the facility, supporting recovery and long-term development.
            </p>
          </div>
        </div>

        {/* Pillar grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {pillars.map((p, i) => (
            <div key={i} className="p-5 border transition-colors"
              style={{ borderColor: 'rgba(123,167,188,0.15)', backgroundColor: 'rgba(50,72,90,0.2)' }}>
              <p className="font-display text-xert-offwhite uppercase text-lg mb-1">{p.label}</p>
              <p className="font-body text-sm" style={{ color: '#7BA7BC' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}