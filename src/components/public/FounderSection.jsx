import React from 'react';

const PHOTO = 'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/1e45b8aa7_marvin-cors-3CQm9H6oJhM-unsplash.jpg';

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
              Veteran owned.<br />
              <span style={{ color: 'rgba(209,221,230,0.5)' }}>Built for local standards.</span>
            </h2>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-8">
              {['Veteran Owned', 'Emergency Services Experience', 'Military Training Background'].map(b => (
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
              XERT is being built with military and emergency-services training experience — but designed for everyday people who want structure and purpose in their training.
            </p>
            <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.7)', fontSize: '0.9375rem' }}>
              The goal is to create a structured, local training environment where Kingaroy can work hard, progress properly and build a stronger community — regardless of where you're starting from.
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