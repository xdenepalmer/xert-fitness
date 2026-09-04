import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';

export default function LegalPage({ eyebrow, title, updated, intro, sections }) {
  return (
    <div className="min-h-screen bg-xert-navy">
      <PublicNav />
      <main id="main" className="relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[30rem] pointer-events-none xert-glow-top" />
        <div className="relative max-w-3xl mx-auto px-6 pt-28 sm:pt-32 pb-14 sm:pb-20">
          <div className="flex items-center gap-3 mb-6 xert-enter xert-enter-left">
            <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
            <p className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">{eyebrow}</p>
          </div>
          <h1
            className="font-display uppercase text-xert-offwhite xert-enter xert-enter-up"
            style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}
          >
            {title}
          </h1>
          <p className="xert-chip mt-5">Last updated {updated}</p>
          <p className="font-body text-base leading-relaxed mt-8 max-w-prose text-xert-pale/75">{intro}</p>

          <div className="mt-10 space-y-4">
            {sections.map(section => (
              <section key={section.title} className="xert-card-flat p-5 sm:p-6">
                <h2 className="font-display text-2xl uppercase text-xert-offwhite">{section.title}</h2>
                <div className="font-body text-sm leading-7 mt-3 space-y-3 max-w-prose break-words text-xert-pale/70">
                  {section.content.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
