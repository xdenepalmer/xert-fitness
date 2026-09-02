import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import PartnerInterestForm from '@/components/public/PartnerInterestForm';

export default function PartnerInterest() {
  return (
    <div className="bg-xert-navy min-h-screen flex flex-col">
      <PublicNav />

      <main id="main" className="xert-glow-top relative flex-1 pt-20 pb-14 px-6 sm:pb-20">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6 mt-8">
            <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
            <span className="font-body text-xs text-xert-steel uppercase tracking-[0.2em]">Allied Health / Partners</span>
          </div>

          <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-tight text-xert-offwhite uppercase mb-4">
            Partner /<br />
            <span className="text-xert-steel">Allied Health Interest.</span>
          </h1>

          <p className="font-body text-base text-xert-pale/75 leading-relaxed mb-3">
            XERT is building relationships with qualified health practitioners and specialist partners to support our community.
          </p>
          <p className="font-body text-base text-xert-pale/75 leading-relaxed mb-10">
            Whether you're a physio, nutritionist, psychologist, massage therapist or other qualified practitioner — register your interest and we'll be in touch.
          </p>

          <div className="xert-card p-5 sm:p-8">
            <PartnerInterestForm />
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}