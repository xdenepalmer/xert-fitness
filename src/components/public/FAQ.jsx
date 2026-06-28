import React, { useState } from 'react';

const faqs = [
  {
    q: 'When is XERT opening?',
    a: 'XERT is targeting a soft launch in August. This means limited classes and a staged opening as the facility takes shape. The full facility will open in phases after that. Register your interest now to be kept in the loop.',
  },
  {
    q: 'What does soft launch mean?',
    a: 'During the soft launch, XERT will open for classes with limited capacity while the full setup continues. Not every part of the facility may be available straight away. This lets us get the standard right before scaling up.',
  },
  {
    q: 'Where is XERT based?',
    a: 'XERT Fitness is located in Kingaroy, Queensland. Exact address details will be confirmed and shared with foundation members before opening.',
  },
  {
    q: 'Do I need to be fit already?',
    a: 'No. XERT classes are designed to be scalable. Every movement can be adjusted to your current level. Beginners are coached from the start. You do not need any prior experience to join.',
  },
  {
    q: 'Will there be personal training?',
    a: 'Yes. Personal training is planned as part of the XERT service. You can register your interest in PT via the foundation form, and we will reach out once the schedule is set.',
  },
  {
    q: 'What kind of classes will run?',
    a: 'XERT is planning six class formats: XERT Foundation (beginner-friendly), XERT Strength, XERT Engine (conditioning and endurance), XERT Hybrid, XERT Event Prep, and XERT Team sessions.',
  },
  {
    q: 'Will this be CrossFit?',
    a: 'No. XERT is not affiliated with CrossFit. It is an independently developed functional training program with its own structure, standards and coaching approach.',
  },
  {
    q: 'How many people per class?',
    a: 'During soft launch, class capacity will be limited — likely around 12 people per session. This allows proper coaching and a quality experience while the facility builds out.',
  },
  {
    q: 'Will there be nutrition or allied health support?',
    a: 'Allied health and specialist support is part of the XERT vision. We are currently collecting expressions of interest from qualified practitioners. If you are a practitioner, you can register via the partner/allied health form.',
  },
  {
    q: 'Is pricing available yet?',
    a: 'Membership pricing is not confirmed yet. Foundation members who register interest will receive information first. There will be no payments required in the foundation phase.',
  },
  {
    q: 'Can I register as a trainer?',
    a: 'Yes. Use the Trainer / Coach interest form to tell us about your qualifications, availability and experience. We will review all applications as coaching positions are confirmed.',
  },
  {
    q: 'Can I register as a specialist or partner?',
    a: 'Yes. Use the Allied Health / Partner interest form. This is open to physios, nutritionists, psychologists, massage therapists, sports dietitians and other qualified practitioners interested in partnering with XERT.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);

  return (
    <section className="bg-xert-black py-20 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Label */}
        <div className="flex items-center gap-3 mb-10">
          <div className="h-px w-6 bg-xert-red" />
          <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Questions</span>
        </div>

        <h2 className="font-display text-[clamp(2rem,5vw,3rem)] text-xert-offwhite uppercase mb-10">
          Common questions.
        </h2>

        <div className="space-y-0">
          {faqs.map((faq, i) => (
            <div key={i} className="border-b border-xert-steel/20">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between py-4 text-left group"
              >
                <span className="font-body text-base text-xert-offwhite group-hover:text-xert-red transition-colors pr-4">
                  {faq.q}
                </span>
                <span className={`font-display text-xert-red text-xl transition-transform shrink-0 ${open === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {open === i && (
                <div className="pb-5 pr-8">
                  <p className="font-body text-sm text-xert-concrete/70 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}