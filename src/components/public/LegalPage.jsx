import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';

export default function LegalPage({ eyebrow, title, updated, intro, sections }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main className="max-w-3xl mx-auto px-6 pt-32 pb-20">
        <p className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>{eyebrow}</p>
        <h1 className="font-display text-4xl sm:text-5xl uppercase text-xert-offwhite mt-3">{title}</h1>
        <p className="font-body text-xs mt-3" style={{ color: 'rgba(209,221,230,0.45)' }}>Last updated {updated}</p>
        <p className="font-body text-base leading-relaxed mt-8" style={{ color: 'rgba(209,221,230,0.74)' }}>{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map(section => (
            <section key={section.title}>
              <h2 className="font-display text-2xl uppercase text-xert-offwhite">{section.title}</h2>
              <div className="font-body text-sm leading-7 mt-3 space-y-3" style={{ color: 'rgba(209,221,230,0.68)' }}>
                {section.content.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
