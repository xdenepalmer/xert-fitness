import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import TrainerInterestForm from '@/components/public/TrainerInterestForm';

export default function TrainerInterest() {
  return (
    <div className="bg-xert-navy min-h-screen flex flex-col">
      <PublicNav />

      <main id="main" className="xert-glow-top relative flex-1 pt-20 pb-14 px-6 sm:pb-20">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 mt-8">
            <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
            <span className="font-body text-xs text-xert-steel uppercase tracking-[0.2em]">Coaching Team</span>
          </div>

          <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-tight text-xert-offwhite uppercase mb-4">
            Trainer / Coach<br />
            <span className="text-xert-steel">Interest.</span>
          </h1>

          <p className="font-body text-base text-xert-pale/75 leading-relaxed mb-10">
            XERT is building its coaching team for the August soft launch. If you have qualifications, experience with functional training approaches and a genuine interest in structured coaching — we'd like to hear from you.
          </p>

          <div className="xert-card p-5 sm:p-8">
            <TrainerInterestForm />
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
