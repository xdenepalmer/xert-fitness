import React from 'react';

const PHOTO = '/assets/training-philosophy.jpg';

export default function FounderSection() {
  return (
    <section className="relative py-20 px-6 overflow-hidden" style={{ backgroundColor: '#101820' }}>
      {/* Left accent line */}
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: '#32485A' }} />

      <div className="max-w-5xl mx-auto pl-8">
        <div className="flex items-center gap-3 mb-8">
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Philosophy</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="font-display uppercase mb-6"
              style={{ fontSize: 'clamp(2rem,5vw,3.5rem)', lineHeight: 0.95, color: '#F1F3F4' }}>
              Train for life.<br />
              <span style={{ color: 'rgba(209,221,230,0.5)' }}>Compete for fun.</span>
            </h2>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-8">
              {['Real-world events', 'Sustainable progress', 'Community accountability'].map(b => (
                <span key={b} className="px-3 py-1.5 font-body text-xs uppercase tracking-wider border"
                  style={{ borderColor: 'rgba(123,167,188,0.3)', color: '#7BA7BC' }}>
                  {b}
                </span>
              ))}
            </div>

            {/* Photo on mobile */}
            <div className="lg:hidden mb-8 aspect-video overflow-hidden">
              <img src={PHOTO} alt="Training" className="w-full h-full object-cover"
                style={{ filter: 'saturate(0.6) brightness(0.7)' }} />
            </div>
          </div>

          <div className="space-y-4">
            <p className="font-body leading-relaxed" style={{ color: '#D1DDE6', fontSize: '1rem' }}>
              XERT is built around preparing members for real-world events, from local sport to endurance racing, functional fitness competitions and personal challenges.
            </p>
            <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.7)', fontSize: '0.9375rem' }}>
              Training is purposeful, progressive and sustainable. Members choose the events that matter to them, train together and build toward shared goals throughout the year.
            </p>
            <div className="pt-4 border-t" style={{ borderColor: 'rgba(123,167,188,0.2)' }}>
              <p className="font-display text-sm uppercase tracking-widest" style={{ color: 'rgba(209,221,230,0.35)' }}>
                Beat Your Best.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
