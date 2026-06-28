import React from 'react';

export default function WhatXertIs() {
  return (
    <section className="bg-xert-black py-20 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div>
          {/* Label */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-6 bg-xert-red" />
            <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">What XERT Is</span>
          </div>

          <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-tight text-xert-offwhite uppercase mb-6">
            Not another commercial gym.<br />
            <span className="text-xert-concrete/60">Not random workouts.</span>
          </h2>

          {/* Progress line */}
          <div className="h-0.5 bg-xert-steel/30 mb-6 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-2/3 bg-xert-red" />
          </div>
        </div>

        <div className="space-y-6">
          <p className="font-body text-base text-xert-concrete/80 leading-relaxed">
            XERT Fitness is being built as a modern functional training facility for Kingaroy — structured classes, scalable movements, conditioning, endurance work, personal training and education.
          </p>
          <p className="font-body text-base text-xert-concrete/80 leading-relaxed">
            You do not need to be advanced to start. The goal is to help everyday people train properly, progress safely and build confidence through structure.
          </p>

          {/* Structural pillars */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            {['Structured classes', 'Scalable movements', 'Endurance work', 'Personal training', 'Coaching education', 'Community focus'].map((item) => (
              <div key={item} className="flex items-center gap-2 py-2 border-b border-xert-steel/20">
                <div className="w-1 h-1 bg-xert-red rounded-full" />
                <span className="font-body text-sm text-xert-concrete/70">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}