import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import PartnerInterestForm from '@/components/public/PartnerInterestForm';

export default function PartnerInterest() {
  return (
    <div className="bg-xert-black min-h-screen flex flex-col">
      <PublicNav />

      <main className="flex-1 pt-20 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6 mt-8">
            <div className="h-0.5 w-6 bg-xert-red" />
            <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Allied Health / Partners</span>
          </div>

          <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] leading-tight text-xert-offwhite uppercase mb-4">
            Partner /<br />
            <span className="text-xert-concrete/50">Allied Health Interest.</span>
          </h1>

          <p className="font-body text-base text-xert-concrete/70 leading-relaxed mb-3">
            XERT is building relationships with qualified health practitioners and specialist partners to support our community.
          </p>
          <p className="font-body text-base text-xert-concrete/70 leading-relaxed mb-10">
            Whether you're a physio, nutritionist, psychologist, massage therapist or other qualified practitioner — register your interest and we'll be in touch.
          </p>

          <div className="bg-xert-ink border border-xert-steel/20 p-6 sm:p-8">
            <PartnerInterestForm />
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}