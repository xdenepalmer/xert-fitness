import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

const LOGO = '/assets/xert-logo-horizontal-light.png';

/* Blueprint grid backdrop shared with PageHeader/home hero. */
const GRID_BACKDROP = {
  backgroundImage:
    'linear-gradient(rgba(123,167,188,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.05) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, transparent)',
};

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { session } = useSupabaseAuth();
  const hamburgerRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  // Close the sheet whenever the route (or hash) changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Lock body scroll while the sheet is open; restore on close/unmount.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  // Escape closes the sheet and hands focus back to the hamburger; Tab cycles
  // within the nav so keyboard focus can't escape into the covered page.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = e => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        hamburgerRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = navRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll('a[href], button:not([disabled])'))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // If the viewport crosses into desktop while open, drop the sheet (and its scroll lock).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = e => {
      if (e.matches) setMenuOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [menuOpen]);

  const navLinks = [
    { to: '/', label: 'Home' },
    { href: '/#facility', label: 'Facility' },
    { to: '/timetable', label: 'Timetable' },
    { to: '/coaches', label: 'Coaches' },
    { to: '/events', label: 'Events' },
    { to: '/contact', label: 'Contact' },
  ];

  const solid = scrolled || menuOpen;
  const navBg = solid
    ? 'bg-xert-navy border-b'
    : 'bg-transparent border-b border-transparent';

  // No backdrop-filter on the nav: a non-none backdrop-filter makes it a
  // containing block for fixed descendants, which collapses the mobile sheet
  // to zero height — and the bar is fully opaque when solid anyway. z-index
  // rises above StickyMobileCTA (z-40) while the sheet is open.
  return (
    <nav ref={navRef}
      className={`fixed top-0 left-0 right-0 ${menuOpen ? 'z-50' : 'z-40'} transition-all duration-300 ${navBg}`}
      style={{
        borderColor: solid ? 'rgba(123,167,188,0.15)' : 'transparent',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
      {/* Skip link: invisible until keyboard focus, jumps past the nav. */}
      <a href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:px-5 focus-visible:py-3 focus-visible:bg-xert-steel focus-visible:text-xert-navy font-display text-sm uppercase tracking-wide">
        Skip to content
      </a>

      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <Link to="/" aria-label="XERT Fitness home" className="flex min-w-11 min-h-11 items-center">
          <img src={LOGO} alt="XERT Fitness" className="h-7 w-auto object-contain" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => {
            const active = l.to && location.pathname === l.to;
            const linkClass = `inline-flex min-h-11 items-center font-body text-sm uppercase tracking-wider transition-colors ${
              active ? 'text-xert-steel' : 'text-xert-pale/60 hover:text-xert-offwhite'
            }`;

            return l.to ? (
              <Link key={l.to} to={l.to} className={linkClass}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className={linkClass}>
                {l.label}
              </a>
            );
          })}
          <Link to={session ? '/account' : '/login'}
            className="ml-4 inline-flex min-h-11 items-center font-body text-sm uppercase tracking-wider transition-colors text-xert-pale/60 hover:text-xert-offwhite">
            {session ? 'Account' : 'Log In'}
          </Link>
          <Link to="/booking"
            className="xert-btn-primary px-5 py-2 font-display text-sm uppercase tracking-wide">
            Book Now
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          className="md:hidden min-w-11 min-h-11 p-2 flex flex-col items-center justify-center text-xert-pale/70">
          <div className={`w-5 h-0.5 bg-current transition-all mb-1.5 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <div className={`w-5 h-0.5 bg-current transition-all mb-1.5 ${menuOpen ? 'opacity-0' : ''}`} />
          <div className={`w-5 h-0.5 bg-current transition-all ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile menu: full-screen sheet below the bar */}
      {menuOpen && (
        <div id="mobile-navigation"
          className="md:hidden fixed inset-x-0 bottom-0 overflow-y-auto bg-xert-navy"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top))' }}>
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={GRID_BACKDROP} />
          <div className="relative flex flex-col gap-1 px-6 py-8"
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            {navLinks.map((l, i) => {
              const active = l.to && location.pathname === l.to;
              const itemClass = `xert-enter xert-enter-up flex min-h-11 items-center font-display text-3xl uppercase py-1.5 ${
                active ? 'text-xert-steel' : 'text-xert-pale'
              }`;
              const itemStyle = { animationDelay: `${i * 55}ms` };

              return l.to ? (
                <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
                  className={itemClass} style={itemStyle}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                  className={itemClass} style={itemStyle}>
                  {l.label}
                </a>
              );
            })}
            <Link to={session ? '/account' : '/login'} onClick={() => setMenuOpen(false)}
              className="xert-enter xert-enter-up flex min-h-11 items-center font-display text-3xl uppercase py-1.5 text-xert-pale"
              style={{ animationDelay: `${navLinks.length * 55}ms` }}>
              {session ? 'Account' : 'Log In'}
            </Link>
            <Link to="/booking" onClick={() => setMenuOpen(false)}
              className="xert-btn-primary xert-enter xert-enter-up mt-6 flex min-h-12 items-center justify-center font-display text-lg uppercase tracking-wide"
              style={{ animationDelay: `${(navLinks.length + 1) * 55}ms` }}>
              Book Now
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
