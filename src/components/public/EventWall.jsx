import React from 'react';

const eventCategories = [
  'Functional fitness events',
  'Team challenges',
  'Endurance races',
  'Obstacle / challenge events',
  'Local comps',
  'Charity fitness events',
  'Military-style endurance challenges',
];

const PHOTO = 'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/9db07f8bb_marvin-cors-m2z68_2BuyM-unsplash.jpg';

export default function EventWall() {
  return (
    <section className="relative overflow-hidden py-20" style={{ backgroundColor: '#0d1720' }}>
      {/* Background photo strip */}
      <div className="absolute inset-0 opacity-10">
        <img src={PHOTO} alt="" className="w-full h-full object-cover"
          style={{ filter: 'saturate(0.3) brightness(0.5)' }} />
      </div>

      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }} />

      <div className="relative max-w-5xl mx-auto px-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>The Goal</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="font-display uppercase"
              style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', lineHeight: 0.95, color: '#F1F3F4' }}>
              Train toward<br />
              <span style={{ color: '#7BA7BC' }}>something.</span>
            </h2>
          </div>
          <div className="flex flex-col justify-end">
            <p className="font-body text-base leading-relaxed mb-6" style={{ color: 'rgba(209,221,230,0.7)' }}>
              Most people train harder when there is something ahead of them. XERT will build around a calendar of functional fitness, endurance, team and challenge events. Members can choose a goal, understand what it requires and train with more purpose.
            </p>
            <a href="#eoi" className="inline-flex items-center gap-2 font-body text-sm transition-colors group"
              style={{ color: '#7BA7BC' }}
              onMouseEnter={e => e.currentTarget.style.color = '#F1F3F4'}
              onMouseLeave={e => e.currentTarget.style.color = '#7BA7BC'}>
              <span>Tell us what you'd train for</span>
              <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </a>
          </div>
        </div>

        {/* Event strip */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-4 -mx-2 px-2">
          {eventCategories.map((cat, i) => (
            <div key={i} className="flex-shrink-0 px-4 py-3 border transition-colors cursor-default"
              style={{ borderColor: 'rgba(123,167,188,0.2)', backgroundColor: 'rgba(50,72,90,0.2)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#7BA7BC'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.2)'}>
              <span className="font-body text-sm whitespace-nowrap" style={{ color: 'rgba(209,221,230,0.8)' }}>{cat}</span>
            </div>
          ))}
        </div>
        <p className="font-body text-xs mt-3 text-center lg:text-left" style={{ color: 'rgba(209,221,230,0.25)' }}>Scroll to see all event categories</p>
      </div>
    </section>
  );
}