import React, { useEffect, useState } from 'react';
import PublicNav from '@/components/public/PublicNav';
import Hero from '@/components/public/Hero';
import Countdown from '@/components/public/Countdown';
import WhatXertIs from '@/components/public/WhatXertIs';
import EventWall from '@/components/public/EventWall';
import TrainingStyle from '@/components/public/TrainingStyle';
import AudienceRows from '@/components/public/AudienceRows';
import FacilitySection from '@/components/public/FacilitySection';
import FounderSection from '@/components/public/FounderSection';
import SessionPacks from '@/components/public/SessionPacks';
import EoiSelector from '@/components/public/EoiSelector';
import FAQ from '@/components/public/FAQ';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import Marquee from '@/components/public/Marquee';
import ScrollProgress from '@/components/public/motion/ScrollProgress';
import Reveal from '@/components/public/motion/Reveal';
import PWAInstallPrompt from '@/components/public/PWAInstallPrompt';
import { getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';

export default function Home() {
  const [settings, setSettings] = useState(getDefaultSettings());

  useEffect(() => {
    getSoftLaunchSettings().then(s => { if (s) setSettings(s); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <ScrollProgress />
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

        <Marquee />

        <Reveal><WhatXertIs /></Reveal>
        <Reveal><TrainingStyle /></Reveal>
        <Reveal><FacilitySection /></Reveal>
        <Reveal><EventWall /></Reveal>
        <Reveal><AudienceRows /></Reveal>

        <Marquee />

        <Reveal><FounderSection /></Reveal>
        <Reveal><SessionPacks /></Reveal>
        <Reveal><EoiSelector /></Reveal>

        {/* Final CTA */}
        <Reveal>
          <section className="py-20 px-6 text-center relative overflow-hidden" style={{ backgroundColor: '#101820', borderTop: '1px solid rgba(123,167,188,0.1)' }}>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(123,167,188,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.05) 1px, transparent 1px)',
                backgroundSize: '64px 64px',
                maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
              }}
            />
            <div className="max-w-xl mx-auto relative">
              <h2 className="font-display uppercase mb-4 text-xert-offwhite" style={{ fontSize: 'clamp(2rem,5vw,3rem)' }}>
                Book your first session.
              </h2>
              <p className="font-body leading-relaxed mb-8" style={{ color: 'rgba(209,221,230,0.65)', fontSize: '1rem' }}>
                Contact XERT to learn more about the coaching system, class packs and the training block that fits your next goal.
              </p>
              <a href="/booking"
                className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase transition-all active:scale-[0.98]"
                style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                Book Your First Session
              </a>
            </div>
          </section>
        </Reveal>

        <Reveal><FAQ /></Reveal>
      </main>

      <PublicFooter />
      <StickyMobileCTA />
      <PWAInstallPrompt />
    </div>
  );
}
