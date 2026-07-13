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
    <section id="eoi" className="py-20 px-6" style={{ backgroundColor: '#101820' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Foundation Interest</span>
        </div>

        <h2 className="font-display uppercase mb-10"
          style={{ fontSize: 'clamp(2rem,5vw,3.5rem)', lineHeight: 0.95, color: '#F1F3F4' }}>
          Register your<br />
          <span style={{ color: '#7BA7BC' }}>interest.</span>
        </h2>

        {/* Tab selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {TABS.map(tab => {
            const isActive = active === tab.key;
            return (
              <button key={tab.key} onClick={() => setActive(tab.key)}
                aria-pressed={isActive}
                className="p-4 border text-left transition-all"
                style={{
                  borderColor: isActive ? '#7BA7BC' : 'rgba(123,167,188,0.2)',
                  backgroundColor: isActive ? 'rgba(123,167,188,0.1)' : 'transparent',
                }}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-display text-base uppercase"
                    style={{ color: isActive ? '#F1F3F4' : 'rgba(209,221,230,0.6)' }}>
                    {tab.label}
                  </p>
                  {tab.tag && (
                    <span className="font-body text-xs px-1.5 py-0.5 uppercase"
                      style={{ backgroundColor: 'rgba(123,167,188,0.2)', color: '#7BA7BC' }}>
                      {tab.tag}
                    </span>
                  )}
                </div>
                <p className="font-body text-xs" style={{ color: 'rgba(123,167,188,0.6)' }}>{tab.desc}</p>
                <span aria-hidden="true" className="mt-3 block h-0.5 w-8 transition-all"
                  style={{ backgroundColor: isActive ? '#7BA7BC' : 'transparent' }} />
              </button>
            );
          })}
        </div>

        {/* Form panel */}
        <div className="p-6 sm:p-8 border" style={{ borderColor: 'rgba(123,167,188,0.15)', backgroundColor: '#0d1720' }}>
          {active === 'member' && <MemberInterestForm />}
          {active === 'trainer' && <TrainerInterestForm />}
          {active === 'partner' && <PartnerInterestForm />}
        </div>
      </div>
    </section>
  );
}