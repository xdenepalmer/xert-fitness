import React, { useEffect, useState } from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import { useSiteContent } from '@/lib/siteContent';
import { ABOUT_DEFAULTS } from '@/lib/contentDefaults';
import { getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';

export default function About() {
  const content = useSiteContent('about', ABOUT_DEFAULTS);
  const paragraphs = content.paragraphs?.length > 0 ? content.paragraphs : ABOUT_DEFAULTS.paragraphs;
  const [settings, setSettings] = useState(getDefaultSettings());
  // Fail closed: Book CTAs stay off until launch settings confirm bookings_enabled
  // (Home / Soft Launch timetable parity).
  const bookingsEnabled = settings.bookings_enabled === true;

  useEffect(() => {
    getSoftLaunchSettings().then(s => { if (s) setSettings(s); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main id="main" className="pb-20">
        <PageHeader eyebrow="About" title="About XERT" accent="Fitness" containerClassName="max-w-3xl" />

        <div className="max-w-3xl mx-auto px-6">
          <div className="mt-6 space-y-5 font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.78)', fontSize: '1.0625rem' }}>
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(123,167,188,0.12)' }}>
            {bookingsEnabled ? (
              <a href="/booking"
                className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide">
                Book Your First Session
              </a>
            ) : (
              <a href="/#eoi"
                className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide">
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
