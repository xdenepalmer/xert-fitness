import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import { useSiteContent } from '@/lib/siteContent';
import { ABOUT_DEFAULTS } from '@/lib/contentDefaults';

export default function About() {
  const content = useSiteContent('about', ABOUT_DEFAULTS);
  const paragraphs = content.paragraphs?.length > 0 ? content.paragraphs : ABOUT_DEFAULTS.paragraphs;
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>About</span>
        </div>

        <h1 className="font-display uppercase mb-8 text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}>
          About XERT Fitness
        </h1>

        <div className="space-y-5 font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.78)', fontSize: '1.0625rem' }}>
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(123,167,188,0.12)' }}>
          <a href="/booking"
            className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
            Book Your First Session
          </a>
        </div>
      </main>
      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}
