import React, { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Instagram, Target, Users } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import Skeleton from '@/components/public/Skeleton';
import { getCoaches } from '@/lib/bookingData';
import { getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';

const CATEGORY_LABELS = {
  coach: 'Coaching Team',
  nutritionist: 'Nutrition',
  massage: 'Massage Therapy',
  physio: 'Physiotherapy',
  allied: 'Allied Health',
};

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');
}

function CoachCard({ coach }) {
  return (
    <article className="border flex flex-col" style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' }}>
      <div className="aspect-[4/5] overflow-hidden relative" style={{ backgroundColor: 'rgba(16,24,32,0.6)' }}>
        {coach.photo_url ? (
          <img src={coach.photo_url} alt={coach.name} loading="lazy" decoding="async" className="w-full h-full object-cover" style={{ filter: 'saturate(0.85)' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-5xl uppercase" style={{ color: 'rgba(123,167,188,0.4)' }}>
              {initials(coach.name) || 'X'}
            </span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-display text-2xl uppercase leading-none text-xert-offwhite">{coach.name}</h3>
        {coach.role && (
          <p className="font-body text-xs uppercase tracking-wider mt-2" style={{ color: '#7BA7BC' }}>{coach.role}</p>
        )}

        {coach.bio && (
          <p className="font-body text-sm leading-relaxed mt-4" style={{ color: 'rgba(209,221,230,0.7)' }}>{coach.bio}</p>
        )}

        <div className="mt-4 space-y-2">
          {coach.experience && (
            <div className="flex items-start gap-2">
              <Dumbbell className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.62)' }}>{coach.experience}</p>
            </div>
          )}
          {coach.currently_training_for && (
            <div className="flex items-start gap-2">
              <Target className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.62)' }}>
                <span className="uppercase tracking-wider text-[11px]" style={{ color: 'rgba(123,167,188,0.7)' }}>Currently training for: </span>
                {coach.currently_training_for}
              </p>
            </div>
          )}
        </div>

        {coach.social_url && (
          <a
            href={coach.social_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 font-body text-xs uppercase tracking-wider transition-colors"
            style={{ color: '#7BA7BC' }}
          >
            <Instagram className="w-4 h-4" />
            Follow
          </a>
        )}
      </div>
    </article>
  );
}

export default function Coaches() {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(getDefaultSettings());
  // Fail closed: Book CTAs stay off until launch settings confirm bookings_enabled
  // (Home / Soft Launch timetable parity).
  const bookingsEnabled = settings.bookings_enabled === true;

  useEffect(() => {
    getCoaches()
      .then(setCoaches)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getSoftLaunchSettings().then(s => { if (s) setSettings(s); }).catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const coachesList = coaches.filter(c => (c.category || 'coach') === 'coach');
    const allied = coaches.filter(c => (c.category || 'coach') !== 'coach');
    /** @type {{ key: string, coaches: any[] }[]} */
    const sections = [];
    if (coachesList.length) sections.push({ key: 'coach', coaches: coachesList });
    if (allied.length) sections.push({ key: 'allied', coaches: allied });
    return sections;
  }, [coaches]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main id="main" className="pb-20">
        <PageHeader
          eyebrow="The Team"
          title={<>Coaches &amp;<br /></>}
          accent="Practitioners."
          intro="Every XERT session is coach-led. Our team brings functional fitness coaching together with nutrition, recovery and allied health support — so you can train with structure and progress sustainably."
          containerClassName="max-w-6xl"
        />

        <div className="max-w-6xl mx-auto px-6">
          <div className="mt-10">
            {loading && (
              <div role="status" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <span className="sr-only">Loading the team…</span>
                {[0, 1, 2].map(i => (
                  <div key={i} className="border flex flex-col" style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' }}>
                    <Skeleton className="aspect-[4/5] w-full" />
                    <div className="p-5 space-y-3">
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <p className="font-body text-sm" style={{ color: '#f0a1a1' }}>Couldn’t load coaches: {error}</p>
            )}

            {!loading && !error && coaches.length === 0 && (
              <div className="border p-10 text-center" style={{ borderColor: 'rgba(123,167,188,0.16)' }}>
                <Users className="w-8 h-8 mx-auto mb-4" style={{ color: 'rgba(123,167,188,0.4)' }} />
                <p className="font-display text-2xl uppercase text-xert-offwhite">Meet the team soon.</p>
                <p className="font-body text-sm mt-2 max-w-md mx-auto" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Coach, nutrition, massage and physio profiles are being finalised and will appear here shortly.
                </p>
              </div>
            )}

            {!loading && !error && groups.map(section => (
              <section key={section.key} className="mb-12">
                <h2 className="font-display text-2xl uppercase mb-5" style={{ color: 'rgba(209,221,230,0.85)' }}>
                  {section.key === 'coach' ? CATEGORY_LABELS.coach : 'Health, Recovery & Performance'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.coaches.map(c => <CoachCard key={c.id} coach={c} />)}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t" style={{ borderColor: 'rgba(123,167,188,0.16)' }}>
            {bookingsEnabled ? (
              <a
                href="/booking"
                className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide"
              >
                Train With Us
              </a>
            ) : (
              <a
                href="/#eoi"
                className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide"
              >
                Register interest
              </a>
            )}
          </div>
        </div>
      </main>

      <PublicFooter showBookCta={bookingsEnabled} />
      {bookingsEnabled && <StickyMobileCTA />}
    </div>
  );
}
