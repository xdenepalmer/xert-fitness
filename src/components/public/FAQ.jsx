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
          {faqs.map((faq, i) => (
            <div key={i} className="border-b" style={{ borderColor: 'rgba(123,167,188,0.12)' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 py-5 text-left"
              >
                <span className="font-body text-base font-medium" style={{ color: open === i ? '#F1F3F4' : '#D1DDE6' }}>
                  {faq.q}
                </span>
                <span className="shrink-0 font-display text-xl" style={{ color: '#7BA7BC' }}>
                  {open === i ? '−' : '+'}
                </span>
              </button>
              {open === i && (
                <div className="pb-5">
                  <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.65)' }}>
                    {faq.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
