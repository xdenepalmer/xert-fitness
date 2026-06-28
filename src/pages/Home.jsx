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
    <div className="bg-xert-black min-h-screen">
      <PublicNav />

      {/* Announcement banner */}
      {settings.announcement_banner_enabled && settings.announcement_banner_text && (
        <div className="fixed top-14 left-0 right-0 z-30 bg-xert-red py-2 px-4 text-center">
          <p className="font-body text-sm text-white">{settings.announcement_banner_text}</p>
        </div>
      )}

      <main className={settings.announcement_banner_enabled && settings.announcement_banner_text ? 'pt-0' : ''}>
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

        {/* Final CTA section */}
        <section className="bg-xert-ink py-20 px-6 text-center">
          <div className="max-w-xl mx-auto">
            <h2 className="font-display text-[clamp(2rem,5vw,3rem)] text-xert-offwhite uppercase mb-4">
              Join the foundation list.
            </h2>
            <p className="font-body text-base text-xert-concrete/70 mb-8">
              Foundation interest helps shape class times, coaching demand, soft launch capacity and the first timetable.
            </p>
            <a href="#eoi"
              className="inline-flex items-center justify-center px-8 py-4 bg-xert-red text-white font-display text-lg uppercase hover:bg-xert-orange transition-colors">
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