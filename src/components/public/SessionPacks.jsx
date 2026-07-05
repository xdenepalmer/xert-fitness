import React from 'react';
import { ArrowRight, Check, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

const steps = [
  'Purchase a session pack.',
  'Book your sessions online.',
  'Train with expert coaching in a structured semi-private environment.',
];

const packs = [
  {
    name: '1 Class Pass',
    price: '$15.00',
    validity: 'Use within 2 weeks',
    description: 'Perfect for a drop-in session, casual training or trying your first XERT session.',
    includes: ['1 coached functional fitness session', 'Accessory equipment access after class where available'],
    cta: 'Book A Session',
  },
  {
    name: '4 Class Starter Pack',
    price: '$48.00',
    validity: 'Use within 4 weeks',
    description: 'A great way to experience the XERT training system.',
    includes: ['4 coached sessions', 'Structured programming access', 'Semi-private coaching environment', 'Flexible booking system'],
    cta: 'Start Your Training Block',
    featured: true,
  },
  {
    name: '10 Class Performance Pack',
    price: '$105.00',
    validity: 'Use within 8 weeks',
    description: 'Designed for members committed to consistency and long-term progress.',
    includes: ['10 coached sessions', 'Flexible booking access', 'Priority class availability', 'Structured progression through training blocks'],
    cta: 'Commit To Your Training',
  },
];

export default function SessionPacks() {
  return (
    <section id="booking" className="py-20 px-6" style={{ backgroundColor: '#0d1720' }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-12 items-start mb-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Classes, Programs, Products</span>
            </div>
            <h2 className="font-display uppercase mb-6" style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 0.95, color: '#F1F3F4' }}>
              Simple booking.<br />
              <span style={{ color: '#7BA7BC' }}>Structured training.</span>
            </h2>
            <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.7)' }}>
              XERT operates through a booking-based system to maintain coaching quality and controlled class sizes. Initial class sizes are set to 8 people and will gradually increase as the business launches.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {steps.map((step, i) => (
              <div key={step} className="border p-5" style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' }}>
                <p className="font-display text-sm tabular-nums mb-4" style={{ color: '#7BA7BC' }}>
                  STEP {i + 1}
                </p>
                <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.72)' }}>{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {packs.map(pack => (
            <article
              key={pack.name}
              className="relative border p-6 flex flex-col"
              style={{
                borderColor: pack.featured ? '#7BA7BC' : 'rgba(123,167,188,0.16)',
                backgroundColor: pack.featured ? 'rgba(123,167,188,0.12)' : 'rgba(16,24,32,0.64)',
              }}
            >
              {pack.featured && (
                <span className="absolute top-4 right-4 font-body text-[10px] uppercase tracking-wider px-2 py-1" style={{ backgroundColor: '#D1DDE6', color: '#101820' }}>
                  Most Popular
                </span>
              )}

              <div className="w-11 h-11 flex items-center justify-center mb-5" style={{ backgroundColor: pack.featured ? '#7BA7BC' : 'rgba(123,167,188,0.14)' }}>
                <Ticket className="w-5 h-5" style={{ color: pack.featured ? '#101820' : '#7BA7BC' }} />
              </div>

              <h3 className="font-display text-3xl uppercase text-xert-offwhite leading-none mb-2">{pack.name}</h3>
              <p className="font-display text-4xl uppercase mb-2" style={{ color: '#7BA7BC' }}>{pack.price}</p>
              <p className="font-body text-xs uppercase tracking-wider mb-5" style={{ color: 'rgba(209,221,230,0.45)' }}>{pack.validity}</p>
              <p className="font-body text-sm leading-relaxed mb-5" style={{ color: 'rgba(209,221,230,0.68)' }}>{pack.description}</p>

              <div className="space-y-3 mb-6 flex-1">
                {pack.includes.map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
                    <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.62)' }}>{item}</p>
                  </div>
                ))}
              </div>

              <Link
                to="/booking"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 font-display text-base uppercase tracking-wide transition-all active:scale-[0.98]"
                style={{ backgroundColor: pack.featured ? '#7BA7BC' : 'transparent', color: pack.featured ? '#101820' : '#D1DDE6', border: pack.featured ? '1px solid #7BA7BC' : '1px solid rgba(123,167,188,0.35)' }}
              >
                {pack.cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
