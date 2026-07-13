import React, { useState } from 'react';
import { useSiteContent } from '@/lib/siteContent';
import { FAQ_DEFAULTS } from '@/lib/contentDefaults';


export default function FAQ() {
  const [open, setOpen] = useState(null);
  const content = useSiteContent('faq', FAQ_DEFAULTS);
  const faqs = (content.items || []).filter(f => f.q && f.a);

  if (faqs.length === 0) return null;

  return (
    <section className="py-20 px-6" style={{ backgroundColor: '#0d1720' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>FAQ</span>
        </div>

        <h2 className="font-display uppercase mb-10" style={{ fontSize: 'clamp(2rem,5vw,3rem)', color: '#F1F3F4' }}>
          Common Questions.
        </h2>

        <div className="space-y-0">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="border-b" style={{ borderColor: 'rgba(123,167,188,0.12)' }}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="font-body text-base font-medium transition-colors duration-200" style={{ color: isOpen ? '#F1F3F4' : '#D1DDE6' }}>
                    {faq.q}
                  </span>
                  {/* Plus that folds into a minus: the vertical bar rotates flat when open */}
                  <span aria-hidden="true" className="relative h-4 w-4 shrink-0">
                    <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2" style={{ backgroundColor: '#7BA7BC' }} />
                    <span
                      className="absolute top-0 bottom-0 left-1/2 w-px transition-transform duration-300"
                      style={{ backgroundColor: '#7BA7BC', transform: isOpen ? 'translateX(-50%) rotate(90deg)' : 'translateX(-50%) rotate(0deg)' }}
                    />
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
                    <p className="pb-5 font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.65)' }}>
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
