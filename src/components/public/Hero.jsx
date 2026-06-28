import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Uploaded training photos
const PHOTOS = [
  'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/c59c7f1fd_IMG_5040.jpg',
  'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/96b56ee6c_IMG_5041.jpg',
  'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/1fb3d6d4e_justin-fisher-k4-H6EO86yY-unsplash.jpg',
  'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/1e45b8aa7_marvin-cors-3CQm9H6oJhM-unsplash.jpg',
  'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/9db07f8bb_marvin-cors-m2z68_2BuyM-unsplash.jpg',
];

const LOGO_WHITE = 'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/ffb8ab471_Logo_xert_final-10.jpg';
const LOGO_FULL_WHITE = 'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/a1601f524_Logo_xert_final-01.png';

const VALUES = ['Discipline', 'Structure', 'Purpose', 'Performance', 'Resilience', 'Community', 'Education', 'Preparation'];

export default function Hero() {
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhotoIndex(i => (i + 1) % PHOTOS.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-xert-navy">
      {/* Background photo with blue-steel grade overlay */}
      {PHOTOS.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === photoIndex ? 1 : 0 }}
        >
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover object-center"
            style={{ filter: 'saturate(0.5) brightness(0.38)' }}
          />
        </div>
      ))}

      {/* Steel-blue gradient overlay — brand direction */}
      <div className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, rgba(16,24,32,0.92) 0%, rgba(50,72,90,0.65) 50%, rgba(16,24,32,0.97) 100%)'
        }}
      />

      {/* Top fine line */}
      <div className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: 'linear-gradient(90deg, transparent, #7BA7BC, transparent)' }}
      />

      {/* Nav spacer */}
      <div className="relative z-10 h-14" />

      {/* Main hero content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 pt-8 pb-20">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — brand + copy */}
          <div>
            {/* Logo lockup */}
            <div className="mb-8">
              <img
                src={LOGO_FULL_WHITE}
                alt="XERT Fitness"
                className="h-16 sm:h-20 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>

            {/* Campaign line */}
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.25em]" style={{ color: '#7BA7BC' }}>Beat Your Best</span>
            </div>

            {/* Main headline */}
            <h1 className="font-display text-[clamp(3rem,10vw,7rem)] leading-[0.9] text-xert-offwhite uppercase mb-6 tracking-tight">
              Kingaroy<br />
              <span style={{ color: '#D1DDE6' }}>Functional</span><br />
              Training.
            </h1>

            {/* Descriptor */}
            <p className="font-body text-base sm:text-lg leading-relaxed mb-3" style={{ color: '#D1DDE6', maxWidth: '42ch' }}>
              Built around purpose. Structured classes, event preparation, personal coaching and allied health — all under one roof.
            </p>
            <p className="font-body text-sm leading-relaxed mb-8" style={{ color: '#7BA7BC', maxWidth: '38ch' }}>
              Train with structure, build resilience and prepare for more.
            </p>

            {/* Soft launch badge */}
            <div className="flex items-center gap-3 mb-8">
              <div className="flex items-center gap-2 px-3 py-1.5 border" style={{ borderColor: 'rgba(123,167,188,0.4)' }}>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#7BA7BC' }} />
                <span className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>Soft Launch — August</span>
              </div>
              <span className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.4)' }}>Limited foundation capacity</span>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="#eoi"
                className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide transition-all"
                style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1DDE6'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7BA7BC'}>
                Register Foundation Interest
              </a>
              <Link to="/timetable"
                className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide border transition-all"
                style={{ borderColor: 'rgba(123,167,188,0.5)', color: '#D1DDE6' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7BA7BC'; e.currentTarget.style.color = '#F1F3F4'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.5)'; e.currentTarget.style.color = '#D1DDE6'; }}>
                View Soft Launch Plan
              </Link>
            </div>
          </div>

          {/* Right — feature photo */}
          <div className="hidden lg:block relative">
            <div className="relative aspect-[3/4] overflow-hidden">
              <img
                src={PHOTOS[photoIndex]}
                alt="XERT Training"
                className="w-full h-full object-cover transition-opacity duration-700"
                style={{ filter: 'saturate(0.7) brightness(0.75)' }}
              />
              {/* Blue vignette on photo */}
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(16,24,32,0.3) 0%, transparent 40%, rgba(16,24,32,0.7) 100%)' }}
              />
              {/* Photo label */}
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1" style={{ backgroundColor: 'rgba(123,167,188,0.4)' }} />
                  <span className="font-body text-xs uppercase tracking-widest" style={{ color: '#7BA7BC' }}>Kingaroy, QLD</span>
                </div>
              </div>
            </div>
            {/* BEAT YOUR BEST watermark */}
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 font-display text-[5rem] leading-none uppercase -rotate-90 origin-right"
              style={{ color: 'rgba(123,167,188,0.06)', whiteSpace: 'nowrap' }}>
              Beat Your Best
            </div>
          </div>
        </div>
      </div>

      {/* Values strip */}
      <div className="relative z-10 border-t" style={{ borderColor: 'rgba(123,167,188,0.15)', backgroundColor: 'rgba(16,24,32,0.85)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-0 overflow-x-auto scrollbar-hide">
          {VALUES.map((v, i) => (
            <React.Fragment key={v}>
              <span className="font-display text-sm uppercase tracking-[0.15em] whitespace-nowrap shrink-0 py-1" style={{ color: i % 2 === 0 ? '#D1DDE6' : '#7BA7BC' }}>{v}</span>
              {i < VALUES.length - 1 && <span className="mx-4 shrink-0" style={{ color: 'rgba(123,167,188,0.25)' }}>·</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="relative z-10" style={{ backgroundColor: 'rgba(50,72,90,0.6)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-6 py-5 grid grid-cols-3 gap-0 divide-x" style={{ borderColor: 'rgba(123,167,188,0.2)' }}>
          {[
            { label: 'Soft Launch', value: 'August' },
            { label: 'Class Types', value: '6+' },
            { label: 'Location', value: 'Kingaroy QLD' },
          ].map((stat, i) => (
            <div key={i} className={`px-6 ${i === 0 ? 'pl-0' : ''} ${i === 2 ? 'pr-0' : ''}`}>
              <p className="font-body text-xs uppercase tracking-wider mb-1" style={{ color: '#7BA7BC' }}>{stat.label}</p>
              <p className="font-display text-xl text-xert-offwhite uppercase">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}