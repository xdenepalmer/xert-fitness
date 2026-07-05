import React from 'react';

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
    <section className="py-20 px-6 relative" style={{ backgroundColor: '#101820' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header with photo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-16 items-center">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>How We Train</span>
            </div>
            <h2 className="font-display uppercase mb-6"
              style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 0.95, color: '#F1F3F4' }}>
              Structure.<br />
              <span style={{ color: '#7BA7BC' }}>Purpose.</span><br />
              Performance.
            </h2>
            <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.7)', fontSize: '0.9375rem' }}>
              XERT is not a commercial gym. Every session is coached, programmed and built around helping members improve, whether the goal is general fitness, event preparation, strength or long-term health.
            </p>
          </div>
          <div className="relative aspect-video lg:aspect-square overflow-hidden">
            <img src={PHOTO} alt="Training at XERT" className="w-full h-full object-cover"
              style={{ filter: 'saturate(0.65) brightness(0.7)' }} />
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, rgba(16,24,32,0.5) 0%, transparent 60%)' }} />
            {/* Beat your best overlay */}
            <div className="absolute bottom-4 left-4">
              <p className="font-display text-2xl uppercase" style={{ color: 'rgba(209,221,230,0.6)' }}>Beat Your Best</p>
            </div>
          </div>
        </div>

        {/* Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pillars.map((p, i) => (
            <div key={i} className="p-5 border"
              style={{ borderColor: 'rgba(123,167,188,0.15)', backgroundColor: 'rgba(50,72,90,0.15)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#7BA7BC' }} />
                <p className="font-display text-base uppercase text-xert-offwhite">{p.label}</p>
              </div>
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.6)' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
