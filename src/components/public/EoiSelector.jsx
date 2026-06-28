import React, { useState } from 'react';
import MemberInterestForm from './MemberInterestForm';
import TrainerInterestForm from './TrainerInterestForm';
import PartnerInterestForm from './PartnerInterestForm';

const options = [
  {
    key: 'member',
    label: 'Member interest',
    desc: 'Register as a foundation member and shape the soft launch.',
    tag: 'Primary',
  },
  {
    key: 'trainer',
    label: 'Trainer / coach interest',
    desc: 'Apply to join the XERT coaching team.',
    tag: null,
  },
  {
    key: 'partner',
    label: 'Allied health / specialist interest',
    desc: 'Register as a practitioner or partner.',
    tag: null,
  },
];

export default function EoiSelector() {
  const [selected, setSelected] = useState('member');

  return (
    <section id="eoi" className="bg-xert-charcoal py-20 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Label */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6 bg-xert-red" />
          <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Register Interest</span>
        </div>

        <h2 className="font-display text-[clamp(2rem,5vw,3rem)] text-xert-offwhite uppercase mb-8">
          Join the foundation list.
        </h2>

        {/* Selector tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-10">
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSelected(opt.key)}
              className={`relative p-4 text-left transition-all border ${
                selected === opt.key
                  ? 'border-xert-red bg-xert-ink'
                  : 'border-xert-steel/30 bg-xert-charcoal hover:border-xert-steel'
              }`}
            >
              {opt.tag && (
                <span className="absolute top-2 right-2 font-body text-xs bg-xert-red text-white px-1.5 py-0.5 uppercase">
                  {opt.tag}
                </span>
              )}
              <p className={`font-display text-base uppercase mb-1 ${selected === opt.key ? 'text-xert-red' : 'text-xert-offwhite'}`}>
                {opt.label}
              </p>
              <p className="font-body text-xs text-xert-concrete/60 leading-relaxed">{opt.desc}</p>
            </button>
          ))}
        </div>

        {/* Active form */}
        <div className="bg-xert-ink border border-xert-steel/20 p-6 sm:p-8">
          {selected === 'member' && <MemberInterestForm />}
          {selected === 'trainer' && <TrainerInterestForm />}
          {selected === 'partner' && <PartnerInterestForm />}
        </div>
      </div>
    </section>
  );
}