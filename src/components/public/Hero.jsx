import React from 'react';
import { Link } from 'react-router-dom';

const proofPoints = [
  'Soft launch August',
  'Limited foundation capacity',
  'Group training planned',
  '1-on-1 PT planned',
  'Event-prep calendar',
  'Workshops and specialist support planned',
];

export default function Hero() {
  return (
    <section className="relative min-h-screen bg-xert-black overflow-hidden flex flex-col">
      {/* Top label bar */}
      <div className="border-b border-xert-steel/30 px-6 py-3 flex items-center justify-between">
        <span className="font-body text-xs tracking-[0.2em] text-xert-concrete/60 uppercase">
          Kingaroy / Functional Fitness / Soft Launch August
        </span>
        <span className="hidden sm:block font-body text-xs text-xert-concrete/40 uppercase tracking-widest">
          Queensland
        </span>
      </div>

      {/* Main hero grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
        {/* Left — Brand + Copy */}
        <div className="flex flex-col justify-between px-6 pt-8 pb-8 lg:px-12 lg:pt-12 lg:pb-12 border-r border-xert-steel/20">
          {/* Wordmark */}
          <div>
            <div className="mb-2">
              <h1 className="font-display text-[clamp(5rem,18vw,11rem)] leading-none tracking-tight text-xert-white font-black uppercase">
                XERT
              </h1>
              <p className="font-display text-[clamp(1.4rem,4vw,2.4rem)] leading-none tracking-[0.15em] text-xert-concrete/70 uppercase -mt-1 ml-1">
                FITNESS
              </p>
            </div>

            {/* Accent line */}
            <div className="flex items-center gap-3 my-6">
              <div className="h-0.5 w-8 bg-xert-red" />
              <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Kingaroy, QLD</span>
            </div>

            {/* Headline */}
            <h2 className="font-display text-[clamp(1.5rem,4vw,2.8rem)] leading-tight text-xert-offwhite uppercase mb-4">
              Kingaroy functional training,<br />
              <span className="text-xert-red">built around purpose.</span>
            </h2>

            {/* Subheadline */}
            <p className="font-body text-base text-xert-concrete/80 leading-relaxed max-w-md mb-8">
              A new functional training facility opening in stages, combining strength, conditioning, endurance, coaching, community and event preparation.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <a href="#eoi"
                className="inline-flex items-center justify-center px-6 py-4 bg-xert-red text-white font-display text-lg uppercase tracking-wide hover:bg-xert-orange transition-colors">
                Register foundation interest
              </a>
              <Link to="/timetable"
                className="inline-flex items-center justify-center px-6 py-4 border border-xert-steel text-xert-concrete font-display text-lg uppercase tracking-wide hover:border-xert-concrete transition-colors">
                View soft launch plan
              </Link>
            </div>
          </div>

          {/* Proof points */}
          <div className="grid grid-cols-2 gap-2">
            {proofPoints.map((point, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xert-red mt-0.5 text-xs">▸</span>
                <span className="font-body text-xs text-xert-concrete/70">{point}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Visual area */}
        <div className="relative hidden lg:flex flex-col bg-xert-ink overflow-hidden min-h-[500px]">
          {/* Training shed composition placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-xert-charcoal via-xert-ink to-xert-black" />
          
          {/* Grid lines — industrial feel */}
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'linear-gradient(#3A3D3B 1px, transparent 1px), linear-gradient(90deg, #3A3D3B 1px, transparent 1px)',
              backgroundSize: '60px 60px'
            }}
          />

          {/* Large XERT mark watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5">
            <span className="font-display text-[20rem] leading-none text-white font-black select-none">X</span>
          </div>

          {/* Stats overlay — bottom of visual */}
          <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-xert-black/90 to-transparent">
            <div className="grid grid-cols-3 gap-4 border-t border-xert-steel/30 pt-6">
              <div>
                <p className="font-display text-3xl text-xert-red tabular-nums">AUG</p>
                <p className="font-body text-xs text-xert-concrete/60 uppercase tracking-wider mt-1">Soft Launch</p>
              </div>
              <div>
                <p className="font-display text-3xl text-xert-offwhite tabular-nums">6</p>
                <p className="font-body text-xs text-xert-concrete/60 uppercase tracking-wider mt-1">Class Types</p>
              </div>
              <div>
                <p className="font-display text-3xl text-xert-orange tabular-nums">1</p>
                <p className="font-body text-xs text-xert-concrete/60 uppercase tracking-wider mt-1">Location, Kingaroy</p>
              </div>
            </div>
          </div>

          {/* Corner accent */}
          <div className="absolute top-0 right-0 w-32 h-1 bg-xert-red" />
          <div className="absolute top-0 right-0 w-1 h-32 bg-xert-red" />
        </div>
      </div>

      {/* Mobile visual strip */}
      <div className="lg:hidden h-2 bg-gradient-to-r from-xert-red to-xert-orange" />
    </section>
  );
}