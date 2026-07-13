import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSiteContent } from '@/lib/siteContent';
import { HERO_DEFAULTS, HERO_PHOTOS } from '@/lib/contentDefaults';

const LOGO_FULL_WHITE = '/assets/xert-logo-horizontal-light.png';

const VALUES = ['Discipline', 'Structure', 'Purpose', 'Performance', 'Movement Quality', 'Longevity', 'Community', 'Preparation'];

export default function Hero() {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const content = useSiteContent('hero', HERO_DEFAULTS);
  const headlineWords = (content.headline || HERO_DEFAULTS.headline).split(' ');
  const photos = content.photos?.length > 0 ? content.photos : HERO_PHOTOS;
  const idx = photoIndex % photos.length;

  useEffect(() => {
    if (photos.length <= 1) return undefined;
    const t = setInterval(() => setPhotoIndex(i => (i + 1) % photos.length), 5000);
    return () => clearInterval(t);
  }, [photos.length]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrollY(Math.min(window.scrollY, 800));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const bgY = Math.min(160, scrollY * 0.2);
  const contentY = -Math.min(60, scrollY * 0.1);
  const overlayOpacity = Math.max(0.4, 1 - scrollY * 0.0012);

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-xert-navy">
      {/* Background photo with parallax + blue-steel grade */}
      <div className="absolute inset-0 will-change-transform" style={{ transform: `translate3d(0,${bgY}px,0)` }}>
        {photos.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 transition-opacity"
            style={{ opacity: i === idx ? 1 : 0, transitionDuration: '1400ms' }}
          >
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover object-center scale-110"
              style={{ filter: 'saturate(0.5) brightness(0.38)' }}
            />
          </div>
        ))}
      </div>

      {/* Steel-blue gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          opacity: overlayOpacity,
          background: 'linear-gradient(160deg, rgba(16,24,32,0.92) 0%, rgba(50,72,90,0.6) 50%, rgba(16,24,32,0.97) 100%)',
        }}
      />

      {/* Architectural blueprint grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(123,167,188,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.05) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          maskImage: 'linear-gradient(180deg, transparent, black 30%, black 70%, transparent)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent, black 30%, black 70%, transparent)',
        }}
      />

      {/* Top fine animated line */}
      <div
        className="xert-hero-line absolute top-0 left-0 right-0 h-0.5 origin-left"
        style={{ background: 'linear-gradient(90deg, transparent, #7BA7BC, transparent)' }}
      />

      {/* Nav spacer */}
      <div className="relative z-10 h-14" />

      {/* Main hero content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 pt-8 pb-20 will-change-transform" style={{ transform: `translate3d(0,${contentY}px,0)` }}>
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — brand + copy */}
          <div>
            <div className="xert-enter xert-enter-up mb-8">
              <img
                src={LOGO_FULL_WHITE}
                alt="XERT Fitness"
                className="h-16 sm:h-20 w-auto object-contain"
              />
            </div>

            <div className="xert-enter xert-enter-left mb-6 flex items-center gap-3" style={{ animationDelay: '150ms' }}>
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.25em]" style={{ color: '#7BA7BC' }}>Functional Fitness Training Facility</span>
            </div>

            {/* Headline — line-by-line reveal */}
            <h1 className="font-display text-[clamp(3rem,10vw,7rem)] leading-[0.9] text-xert-offwhite uppercase mb-6 tracking-tight overflow-hidden">
              {headlineWords.map((line, i) => (
                <span key={`${line}-${i}`} className="block overflow-hidden">
                  <span className="xert-headline-enter block" style={{ color: i === headlineWords.length - 1 ? '#7BA7BC' : undefined, animationDelay: `${200 + i * 120}ms` }}>
                    {line}
                  </span>
                </span>
              ))}
            </h1>

            <div className="xert-enter xert-enter-up" style={{ animationDelay: '600ms' }}>
              <p className="font-body text-base sm:text-lg leading-relaxed mb-3" style={{ color: '#D1DDE6', maxWidth: '42ch' }}>
                {content.subheading}
              </p>
              <p className="font-body text-sm leading-relaxed mb-8" style={{ color: '#7BA7BC', maxWidth: '38ch' }}>
                {content.supporting}
              </p>

              <div className="flex items-center gap-3 mb-8">
                <div className="flex items-center gap-2 px-3 py-1.5 border" style={{ borderColor: 'rgba(123,167,188,0.4)' }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#7BA7BC' }} />
                  <span className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>Booking-based semi-private classes</span>
                </div>
                <span className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.4)' }}>Initial classes capped at 8</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/booking"
                  className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide transition-all active:scale-[0.98]"
                  style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1DDE6'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7BA7BC'}>
                  Book Your First Session
                </Link>
                <Link to="/timetable"
                  className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide border transition-all active:scale-[0.98]"
                  style={{ borderColor: 'rgba(123,167,188,0.5)', color: '#D1DDE6' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7BA7BC'; e.currentTarget.style.color = '#F1F3F4'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.5)'; e.currentTarget.style.color = '#D1DDE6'; }}>
                  View Timetable
                </Link>
              </div>
            </div>
          </div>

          {/* Right — feature photo */}
          <div className="xert-feature-enter hidden lg:block relative" style={{ animationDelay: '300ms' }}>
            <div className="relative aspect-[3/4] overflow-hidden">
              <img
                src={photos[idx]}
                alt="XERT Training"
                className="w-full h-full object-cover transition-opacity duration-1000"
                style={{ filter: 'saturate(0.7) brightness(0.75)' }}
              />
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(16,24,32,0.3) 0%, transparent 40%, rgba(16,24,32,0.7) 100%)' }}
              />
              {/* Frame ticks */}
              <div className="absolute top-4 left-4 w-8 h-8 border-t border-l" style={{ borderColor: 'rgba(123,167,188,0.5)' }} />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b border-r" style={{ borderColor: 'rgba(123,167,188,0.5)' }} />
              <div className="absolute bottom-4 left-4 right-16">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1" style={{ backgroundColor: 'rgba(123,167,188,0.4)' }} />
                  <span className="font-body text-xs uppercase tracking-widest" style={{ color: '#7BA7BC' }}>Kingaroy, QLD</span>
                </div>
              </div>
              {/* Photo index dots */}
              <div className="absolute top-4 right-4 flex flex-col gap-1.5">
                {photos.map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-500"
                    style={{ backgroundColor: i === idx ? '#7BA7BC' : 'rgba(123,167,188,0.25)' }} />
                ))}
              </div>
            </div>
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
            { label: 'Coached Model', value: 'Semi-private' },
            { label: 'Programming', value: '12-week blocks' },
            { label: 'Location', value: 'Kingaroy QLD' },
          ].map((stat, i) => (
            <div key={i} className={`px-6 ${i === 0 ? 'pl-0' : ''} ${i === 2 ? 'pr-0' : ''}`}>
              <p className="font-body text-xs uppercase tracking-wider mb-1" style={{ color: '#7BA7BC' }}>{stat.label}</p>
              <p className="font-display text-xl text-xert-offwhite uppercase">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll cue */}
      <div className="xert-scroll-cue absolute bottom-[8.5rem] left-1/2 -translate-x-1/2 z-10 hidden sm:flex flex-col items-center gap-2">
        <span className="font-body text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(123,167,188,0.6)' }}>Scroll</span>
        <div
          className="xert-scroll-pulse w-px h-8 origin-top"
          style={{ background: 'linear-gradient(180deg, #7BA7BC, transparent)' }}
        />
      </div>
    </section>
  );
}
