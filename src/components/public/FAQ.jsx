import React, { useState } from 'react';
import { useSiteContent } from '@/lib/siteContent';
import { FAQ_DEFAULTS } from '@/lib/contentDefaults';


export default function FAQ() {
  const [open, setOpen] = useState(null);
  const content = useSiteContent('faq', FAQ_DEFAULTS);
  const faqs = (content.items || []).filter(f => f.q && f.a);

  if (faqs.length === 0) return null;

  return (
    <section className="bg-xert-ink px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-px w-6 bg-xert-steel" />
          <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">FAQ</span>
        </div>

        <h2 className="mb-8 font-display uppercase text-xert-offwhite sm:mb-10" style={{ fontSize: 'clamp(2rem,5vw,3rem)' }}>
          Common Questions.
        </h2>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={`overflow-hidden transition-colors ${isOpen ? 'xert-card-accent' : 'xert-card-flat'}`}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  className="flex min-h-[3.5rem] w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
                >
                  <span className={`font-body text-base font-medium transition-colors duration-200 ${isOpen ? 'text-xert-offwhite' : 'text-xert-pale'}`}>
                    {faq.q}
                  </span>
                  {/* Chevron in a small tile that turns over when the row opens */}
                  <span
                    aria-hidden="true"
                    className={`xert-icon-tile shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem' }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>
                <div
                  id={`faq-answer-${i}`}
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  {/* visibility keeps collapsed answers out of the a11y tree and
                      find-in-page; the close delay lets the collapse animation
                      finish before the content hides. */}
                  <div
                    className="overflow-hidden"
                    style={{
                      visibility: isOpen ? 'visible' : 'hidden',
                      transitionProperty: 'visibility',
                      transitionDuration: '0s',
                      transitionDelay: isOpen ? '0s' : '300ms',
                    }}
                  >
                    <p className="px-4 pb-5 font-body text-sm leading-relaxed text-xert-pale/70 sm:px-5">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
