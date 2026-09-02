import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function StickyMobileCTA() {
  const [scrolled, setScrolled] = useState(false);
  const [footerInView, setFooterInView] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 400);
    };
    const handle = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', handle, { passive: true });
    return () => {
      window.removeEventListener('scroll', handle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Yield to the footer: slide away once it scrolls into view so the CTA
  // never covers the legal links. Footer padding is the no-JS fallback.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const footer = document.querySelector('[data-public-footer]');
    if (!footer) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setFooterInView(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  const visible = scrolled && !footerInView;

  // A floating glass pill inset from the screen edges. The outer track never
  // catches taps (so the gutters stay live); only the pill does, and only
  // while it is on screen.
  return (
    <div
      aria-hidden={!visible}
      className={`fixed bottom-0 left-0 right-0 z-40 md:hidden px-4 pointer-events-none transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className={`xert-glass rounded-2xl p-2 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.85)] ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <Link to="/booking"
          tabIndex={visible ? 0 : -1}
          className="xert-btn-primary flex min-h-[52px] w-full items-center justify-center gap-2 py-3 text-center font-display text-base uppercase tracking-wide">
          Book Your First Session
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
