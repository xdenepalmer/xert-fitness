import React, { useState } from 'react';

const faqs = [
  { q: "When is XERT opening?", a: "Soft launch is planned for August. We'll open in stages — limited class capacity at first, building out as demand and space allow. Register your foundation interest to be notified first." },
  { q: "What classes will be available?", a: "XERT offers structured functional training across strength, aerobic capacity, threshold and intensive sessions. Classes follow progressive training blocks and are coached so members understand the purpose of each session." },
  { q: "Do I need to be fit to join?", a: "No. XERT is built for all levels — from complete beginners to experienced athletes. Coaches scale every session to the individual. The most important thing is showing up and committing to the process." },
  { q: "What is the event prep focus?", a: "XERT follows the South East Queensland sporting and fitness calendar. Members can choose from endurance races, triathlons, trail runs, functional fitness events, local sport and XERT challenges, then train toward those goals together." },
  { q: "Is there personal training available?", a: "Yes. 1-on-1 personal training sessions will be available in addition to group classes. You can request a PT session through the timetable page." },
  { q: "What allied health services will be available?", a: "XERT is building relationships with physiotherapists, nutritionists, psychologists and other practitioners who will operate inside the facility. This means recovery, injury management and performance support are available without leaving the building." },
  { q: "Where is XERT located?", a: "XERT is based in Kingaroy, Queensland 4610. The facility includes a main class training area, accessory training space, onsite parking, bathroom and changeroom access." },
  { q: "How do I register foundation interest?", a: "Use the form on this page. Foundation interest helps us plan class times, coaching demand and first-stage capacity. It's free to register and carries no financial commitment." },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);

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
