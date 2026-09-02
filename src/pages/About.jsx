import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import { useSiteContent } from '@/lib/siteContent';
import { ABOUT_DEFAULTS } from '@/lib/contentDefaults';

export default function About() {
  const content = useSiteContent('about', ABOUT_DEFAULTS);
  const paragraphs = content.paragraphs?.length > 0 ? content.paragraphs : ABOUT_DEFAULTS.paragraphs;
  return (
    <div className="min-h-screen bg-xert-navy">
      <PublicNav />
      <main id="main" className="pb-20">
        <PageHeader eyebrow="About" title="About XERT" accent="Fitness" containerClassName="max-w-3xl" />

        <div className="max-w-3xl mx-auto px-6">
          <div className="xert-card-flat mt-8 p-5 sm:p-8">
            <div className="space-y-5 font-body leading-relaxed max-w-prose text-xert-pale/80" style={{ fontSize: '1.0625rem' }}>
              {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>

          <div className="mt-12">
            <div className="xert-divider mb-8" />
            <a href="/booking"
              className="xert-btn-primary inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-8 font-display text-lg uppercase tracking-wide">
              Book Your First Session
            </a>
          </div>
        </div>
      </main>
      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}
