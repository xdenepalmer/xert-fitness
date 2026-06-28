import React, { useEffect, useState } from 'react';
import PublicNav from '@/components/public/PublicNav';
import Hero from '@/components/public/Hero';
import Countdown from '@/components/public/Countdown';
import WhatXertIs from '@/components/public/WhatXertIs';
import EventWall from '@/components/public/EventWall';
import TrainingStyle from '@/components/public/TrainingStyle';
import AudienceRows from '@/components/public/AudienceRows';
import FounderSection from '@/components/public/FounderSection';
import EoiSelector from '@/components/public/EoiSelector';
import FAQ from '@/components/public/FAQ';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import { getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';

export default function Home() {
  const [settings, setSettings] = useState(getDefaultSettings());

  useEffect(() => {
    getSoftLaunchSettings().then(s => { if (s) setSettings(s); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      {settings.announcement_banner_enabled && settings.announcement_banner_text && (
        <div className="fixed top-14 left-0 right-0 z-30 py-2 px-4 text-center"
          style={{ backgroundColor: '#32485A' }}>
          <p className="font-body text-sm text-xert-offwhite">{settings.announcement_banner_text}</p>
        </div>
      )}

      <main>
        <Hero />
        <Countdown
          targetDate={settings.target_launch_date || '2026-08-01'}
          enabled={settings.countdown_enabled !== false}
        />
        <WhatXertIs />
        <EventWall />
        <TrainingStyle />
        <AudienceRows />
        <FounderSection />
        <EoiSelector />

        {/* Final CTA */}
        <section className="py-20 px-6 text-center" style={{ backgroundColor: '#101820', borderTop: '1px solid rgba(123,167,188,0.1)' }}>
          <div className="max-w-xl mx-auto">
            <h2 className="font-display uppercase mb-4 text-xert-offwhite" style={{ fontSize: 'clamp(2rem,5vw,3rem)' }}>
              Join the foundation list.
            </h2>
            <p className="font-body leading-relaxed mb-8" style={{ color: 'rgba(209,221,230,0.65)', fontSize: '1rem' }}>
              Foundation interest helps shape class times, coaching demand, soft launch capacity and the first timetable.
            </p>
            <a href="#eoi"
              className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase"
              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
              Register interest
            </a>
          </div>
        </section>

        <FAQ />
      </main>

      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}