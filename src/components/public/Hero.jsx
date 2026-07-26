import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSiteContent } from '@/lib/siteContent';
import { HERO_DEFAULTS, HERO_PHOTOS } from '@/lib/contentDefaults';

const LOGO_FULL_WHITE = '/assets/xert-logo-horizontal-light.png';

const VALUES = ['Discipline', 'Structure', 'Purpose', 'Performance', 'Movement Quality', 'Longevity', 'Community', 'Preparation'];

const DESKTOP_QUERY = '(min-width: 1024px)';

export default function Hero({ bookingsEnabled = true }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia?.(DESKTOP_QUERY).matches ?? true);
  const bgRef = useRef(null);
  const contentRef = useRef(null);
  const overlayRef = useRef(null);
  const content = useSiteContent('hero', HERO_DEFAULTS);
  const headlineWords = (content.headline || HERO_DEFAULTS.headline).split(' ');
  const photos = content.photos?.length > 0 ? content.photos : HERO_PHOTOS;
  const idx = photoIndex % photos.length;

  useEffect(() => {
    if (photos.length <= 1) return undefined;
    const t = setInterval(() => setPhotoIndex(i => (i + 1) % photos.length), 5000);
    return () => clearInterval(t);
  }, [photos.length]);

  // Feature photo is desktop-only — skip rendering (and downloading) it on mobile.
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return undefined;
    const onChange = e => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Scroll parallax — writes transforms/opacity straight to the DOM via refs
  // so scrolling never re-renders the component tree.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.min(window.scrollY, 800);
      const bgY = Math.min(160, y * 0.2);
      const contentY = -Math.min(60, y * 0.1);
      const overlayOpacity = Math.max(0.4, 1 - y * 0.0012);
      if (bgRef.current) bgRef.current.style.transform = `translate3d(0,${bgY}px,0)`;
      if (contentRef.current) contentRef.current.style.transform = `translate3d(0,${contentY}px,0)`;
      if (overlayRef.current) overlayRef.current.style.opacity = String(overlayOpacity);
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

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-xert-navy">
      {/* Background photo with parallax + blue-steel grade */}
      <div ref={bgRef} className="absolute inset-0 will-change-transform" style={{ transform: 'translate3d(0,0,0)' }}>
        {photos.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 transition-opacity"
            style={{ opacity: i === idx ? 1 : 0, transitionDuration: '1400ms' }}
          >
            <img
              src={src}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="w-full h-full object-cover object-center scale-110"
              style={{ filter: 'saturate(0.5) brightness(0.38)' }}
            />
          </div>
        ))}
      </div>

      {/* Steel-blue gradient overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{
          opacity: 1,
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
      <div ref={contentRef} className="relative z-10 flex-1 flex flex-col justify-center px-6 pt-5 pb-8 sm:px-10 sm:pt-8 sm:pb-20 lg:px-16 will-change-transform" style={{ transform: 'translate3d(0,0,0)' }}>
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — brand + copy */}
          <div>
            <div className="xert-enter xert-enter-up mb-5 sm:mb-8">
              <img
                src={LOGO_FULL_WHITE}
                alt="XERT Fitness"
                className="h-14 w-auto object-contain sm:h-20"
              />
            </div>

            <div className="xert-enter xert-enter-left mb-4 flex min-w-0 items-start gap-3 sm:mb-6" style={{ animationDelay: '150ms' }}>
              <div className="mt-2 h-px w-6 shrink-0" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="min-w-0 font-body text-xs uppercase leading-relaxed tracking-[0.2em] sm:tracking-[0.25em]" style={{ color: '#7BA7BC' }}>Functional Fitness Training Facility</span>
            </div>

            {/* Headline — line-by-line reveal */}
            <h1 className="mb-4 overflow-hidden font-display text-[clamp(3rem,10vw,7rem)] uppercase leading-[0.9] tracking-tight text-xert-offwhite sm:mb-6">
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
              <p className="mb-5 font-body text-sm leading-relaxed sm:mb-8" style={{ color: '#7BA7BC', maxWidth: '38ch' }}>
                {content.supporting}
              </p>

              <div className="mb-5 flex flex-col items-start gap-2 sm:mb-8 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex max-w-full items-start gap-2 border px-3 py-1.5" style={{ borderColor: 'rgba(123,167,188,0.4)' }}>
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full animate-pulse" style={{ backgroundColor: '#7BA7BC' }} />
                  <span className="font-body text-xs uppercase leading-relaxed tracking-wider" style={{ color: '#7BA7BC' }}>Booking-based semi-private classes</span>
                </div>
                <span className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.4)' }}>Initial classes capped at 8</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {bookingsEnabled ? (
                  <Link to="/booking"
                    className="xert-btn-primary inline-flex min-h-[52px] items-center justify-center px-8 py-3.5 font-display text-lg uppercase tracking-wide sm:py-4">
                    Book Your First Session
                  </Link>
                ) : (
                  <a href="/#eoi"
                    className="xert-btn-primary inline-flex min-h-[52px] items-center justify-center px-8 py-3.5 font-display text-lg uppercase tracking-wide sm:py-4">
                    Register interest
                  </a>
                )}
                <Link to="/timetable"
                  className="xert-btn-ghost inline-flex min-h-[52px] items-center justify-center px-8 py-3.5 font-display text-lg uppercase tracking-wide sm:py-4">
                  View Timetable
                </Link>
              </div>
            </div>
          </div>

          {/* Right — feature photo (desktop only; not rendered on mobile so it never downloads there) */}
          {isDesktop && (
            <div className="xert-feature-enter hidden lg:block relative" style={{ animationDelay: '300ms' }}>
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={photos[idx]}
                  alt="XERT Training"
                  decoding="async"
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
          )}
        </div>
      </div>

      {/* Values strip — infinite marquee */}
      <div className="relative z-10 border-t" style={{ borderColor: 'rgba(123,167,188,0.15)', backgroundColor: 'rgba(16,24,32,0.85)', backdropFilter: 'blur(8px)' }}>
        <div
          className="overflow-hidden py-4"
          style={{
            maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
          }}
        >
          <div className="xert-marquee-track flex whitespace-nowrap">
            {[0, 1].map(dup => (
              <div key={dup} className="flex items-center shrink-0" aria-hidden={dup === 1 ? 'true' : undefined}>
                {/* VALUES twice per half so each half outruns wide viewports —
                    the -50% loop is only seamless when half-width >= container. */}
                {[...VALUES, ...VALUES].map((v, i) => (
                  <React.Fragment key={`${v}-${i}`}>
                    <span className="font-display text-sm uppercase tracking-[0.15em] py-1" style={{ color: i % 2 === 0 ? '#D1DDE6' : '#7BA7BC' }}>{v}</span>
                    <span className="mx-4" style={{ color: 'rgba(123,167,188,0.25)' }}>·</span>
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="relative z-10" style={{ backgroundColor: 'rgba(50,72,90,0.6)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5 grid grid-cols-3 gap-0 divide-x" style={{ borderColor: 'rgba(123,167,188,0.2)' }}>
          {[
            { label: 'Coached Model', value: 'Semi-private' },
            { label: 'Programming', value: '12-week blocks' },
            { label: 'Location', value: 'Kingaroy QLD' },
          ].map((stat, i) => (
            <div key={i} className={`px-3 sm:px-6 ${i === 0 ? 'pl-0 sm:pl-0' : ''} ${i === 2 ? 'pr-0 sm:pr-0' : ''}`}>
              <p className="font-body text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1" style={{ color: '#7BA7BC' }}>{stat.label}</p>
              <p className="font-display text-base sm:text-xl leading-tight text-xert-offwhite uppercase">{stat.value}</p>
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
