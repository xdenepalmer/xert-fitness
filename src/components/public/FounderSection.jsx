import React from 'react';

export default function FounderSection() {
  return (
    <section className="relative bg-xert-ink py-20 px-6 overflow-hidden">
      {/* Accent */}
      <div className="absolute top-0 left-0 w-1 h-full bg-xert-red" />

      <div className="max-w-5xl mx-auto pl-8">
        {/* Label */}
        <div className="flex items-center gap-3 mb-8">
          <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Philosophy</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-tight text-xert-offwhite uppercase mb-6">
              Veteran owned.<br />
              <span className="text-xert-concrete/60">Built for local standards.</span>
            </h2>

            {/* Badge row */}
            <div className="flex flex-wrap gap-2 mb-8">
              <span className="px-3 py-1.5 border border-xert-red/40 font-body text-xs text-xert-red uppercase tracking-wider">
                Veteran Owned
              </span>
              <span className="px-3 py-1.5 border border-xert-steel/40 font-body text-xs text-xert-concrete/50 uppercase tracking-wider">
                Emergency Services Experience
              </span>
              <span className="px-3 py-1.5 border border-xert-steel/40 font-body text-xs text-xert-concrete/50 uppercase tracking-wider">
                Military Training Background
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <p className="font-body text-base text-xert-concrete/80 leading-relaxed">
              XERT is being developed with military and emergency-services training experience, but built for everyday people.
            </p>
            <p className="font-body text-base text-xert-concrete/80 leading-relaxed">
              The goal is to create a structured, local training environment where Kingaroy can work hard, progress properly and build a stronger community.
            </p>
            <p className="font-body text-base text-xert-concrete/80 leading-relaxed">
              Created for everyday people who want structured, purposeful training — regardless of where they're starting from.
            </p>

            <div className="pt-4 border-t border-xert-steel/20">
              <p className="font-display text-sm text-xert-concrete/40 uppercase tracking-widest">
                Train toward something.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}