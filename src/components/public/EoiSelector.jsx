import React, { useState } from 'react';
import MemberInterestForm from './MemberInterestForm';
import TrainerInterestForm from './TrainerInterestForm';
import PartnerInterestForm from './PartnerInterestForm';

const TABS = [
  { key: 'member', label: 'Join as a Member', desc: 'Register foundation interest', tag: 'Primary' },
  { key: 'trainer', label: 'Apply as a Coach', desc: 'Trainer / coach applications', tag: null },
  { key: 'partner', label: 'Allied Health Partner', desc: 'Physio, nutrition, recovery', tag: null },
];

export default function EoiSelector() {
  const [active, setActive] = useState('member');

  return (
    <section id="eoi" className="bg-xert-navy px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px w-6 bg-xert-steel" />
          <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Foundation Interest</span>
        </div>

        <h2 className="mb-8 font-display uppercase text-xert-offwhite sm:mb-10"
          style={{ fontSize: 'clamp(2rem,5vw,3.5rem)', lineHeight: 0.95 }}>
          Register your<br />
          <span className="text-xert-steel">interest.</span>
        </h2>

        {/* Tab selector */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-3">
          {TABS.map(tab => {
            const isActive = active === tab.key;
            return (
              <button key={tab.key} onClick={() => setActive(tab.key)}
                aria-pressed={isActive}
                className={`min-h-11 p-4 text-left transition-colors ${
                  isActive ? 'xert-card-accent' : 'xert-card-flat hover:border-xert-steel/40'
                }`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className={`font-display text-base uppercase ${isActive ? 'text-xert-offwhite' : 'text-xert-pale/60'}`}>
                    {tab.label}
                  </p>
                  {tab.tag && (
                    <span className="xert-chip xert-chip-solid" style={{ padding: '0.2rem 0.55rem', fontSize: '0.625rem' }}>
                      {tab.tag}
                    </span>
                  )}
                </div>
                <p className="font-body text-xs text-xert-steel/70">{tab.desc}</p>
                <span aria-hidden="true" className="mt-3 block h-0.5 w-8 rounded-full transition-all"
                  style={{ backgroundColor: isActive ? '#7BA7BC' : 'transparent' }} />
              </button>
            );
          })}
        </div>

        {/* Form panel */}
        <div className="xert-card p-5 sm:p-8">
          {active === 'member' && <MemberInterestForm />}
          {active === 'trainer' && <TrainerInterestForm />}
          {active === 'partner' && <PartnerInterestForm />}
        </div>
      </div>
    </section>
  );
}
