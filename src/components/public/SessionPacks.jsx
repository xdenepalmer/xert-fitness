import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProducts } from '@/lib/bookingData';
import { getSoftLaunchSettings } from '@/lib/adminData';
import { pricesComingSoon } from '@/lib/launchSettings';
import { formatPackPrice, formatPackValidity, packCta, PRICES_COMING_SOON_LABEL } from '@/lib/products';

const steps = [
  'Purchase a session pack.',
  'Book your sessions online.',
  'Train with expert coaching in a structured semi-private environment.',
];

const SOLID_TILE = { backgroundColor: '#7BA7BC', color: '#101820' };

export default function SessionPacks() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Default to hidden so prices never flash before settings load, and stay
  // hidden if the settings fetch fails.
  const [comingSoon, setComingSoon] = useState(true);

  useEffect(() => {
    let active = true;
    getProducts()
      .then(products => {
        if (!active) return;
        setPacks(products);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // Settings load independently so a settings failure never blocks the packs.
    getSoftLaunchSettings()
      .then(settings => { if (active) setComingSoon(pricesComingSoon(settings)); })
      .catch(() => { if (active) setComingSoon(true); });
    return () => { active = false; };
  }, []);

  return (
    <section id="booking" className="bg-xert-ink px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 grid grid-cols-1 items-start gap-8 sm:mb-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px w-6 bg-xert-steel" />
              <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Classes, Programs, Products</span>
            </div>
            <h2 className="mb-6 font-display uppercase text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 0.95 }}>
              Simple booking.<br />
              <span className="text-xert-steel">Structured training.</span>
            </h2>
            <p className="max-w-[44ch] font-body leading-relaxed text-xert-pale/70">
              XERT operates through a booking-based system to maintain coaching quality and controlled class sizes. Initial class sizes are set to 8 people and will gradually increase as the business launches.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {steps.map((step, i) => (
              <div key={step} className="xert-card-flat p-4 sm:p-5">
                <p className="xert-chip mb-4 tabular-nums">
                  STEP {i + 1}
                </p>
                <p className="font-body text-sm leading-relaxed text-xert-pale/75">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          {loading && [1, 2, 3].map(index => (
            <div key={index} className="xert-card h-[29rem] animate-pulse" />
          ))}
          {!loading && packs.map(pack => {
            const benefits = [
              `${pack.sessions_count} coached session${pack.sessions_count === 1 ? '' : 's'}`,
              'Semi-private coaching environment',
              'Flexible online booking',
            ];
            return (
            <article
              key={pack.id}
              className={`${pack.featured ? 'xert-card-accent' : 'xert-card'} relative flex flex-col p-5 sm:p-6`}
            >
              {pack.featured && (
                <span className="xert-chip xert-chip-solid absolute right-4 top-4">
                  Most Popular
                </span>
              )}

              <div className="xert-icon-tile mb-5" style={pack.featured ? SOLID_TILE : undefined}>
                <Ticket className="w-5 h-5" />
              </div>

              <h3 className="mb-2 font-display text-3xl uppercase leading-none text-xert-offwhite">{pack.name}</h3>
              {comingSoon ? (
                <p className="mb-2 font-display text-2xl uppercase text-xert-steel">{PRICES_COMING_SOON_LABEL}</p>
              ) : (
                <p className="mb-2 font-display text-[2.75rem] uppercase leading-none text-xert-steel">{formatPackPrice(pack.price_cents, pack.currency)}</p>
              )}
              <p className="mb-5 font-body text-xs uppercase tracking-wider text-xert-pale/50">{formatPackValidity(pack.validity_days)}</p>
              <p className="mb-5 font-body text-sm leading-relaxed text-xert-pale/70">{pack.description}</p>

              <div className="mb-6 flex-1 space-y-3">
                {benefits.map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-xert-steel" />
                    <p className="font-body text-sm text-xert-pale/65">{item}</p>
                  </div>
                ))}
              </div>

              <Link
                to="/booking"
                className={`${pack.featured ? 'xert-btn-primary' : 'xert-btn-ghost'} inline-flex min-h-[52px] w-full items-center justify-center gap-2 px-5 py-3 font-display text-base uppercase tracking-wide`}
              >
                {packCta(pack.slug)}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>
            );
          })}
        </div>
        {!loading && (error || packs.length === 0) && (
          <div className="xert-card-flat mt-4 p-5 text-center sm:mt-6">
            <p className="mb-4 font-body text-sm text-xert-pale/70">
              Session packs are available from the live booking page.
            </p>
            <Link to="/booking#packs" className="inline-flex min-h-11 items-center gap-2 font-display text-sm uppercase text-xert-steel">
              View session packs <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
