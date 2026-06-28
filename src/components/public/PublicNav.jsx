import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/timetable', label: 'Timetable' },
    { to: '/trainer-interest', label: 'Coaches' },
    { to: '/partner-interest', label: 'Partners' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all ${scrolled ? 'bg-xert-black/95 border-b border-xert-steel/20 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-xert-offwhite uppercase font-black leading-none">XERT</span>
          <span className="font-display text-xs text-xert-concrete/50 uppercase tracking-widest">FITNESS</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              className={`font-body text-sm uppercase tracking-wider transition-colors ${location.pathname === l.to ? 'text-xert-red' : 'text-xert-concrete/60 hover:text-xert-offwhite'}`}>
              {l.label}
            </Link>
          ))}
          <a href="#eoi"
            className="ml-4 px-5 py-2 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
            Register Interest
          </a>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-xert-concrete/70">
          <div className={`w-5 h-0.5 bg-current transition-all mb-1 ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <div className={`w-5 h-0.5 bg-current transition-all mb-1 ${menuOpen ? 'opacity-0' : ''}`} />
          <div className={`w-5 h-0.5 bg-current transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-xert-ink border-t border-xert-steel/20 px-6 py-4 space-y-3">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
              className="block font-display text-lg text-xert-offwhite uppercase hover:text-xert-red transition-colors py-2">
              {l.label}
            </Link>
          ))}
          <a href="#eoi" onClick={() => setMenuOpen(false)}
            className="block w-full text-center py-3 bg-xert-red text-white font-display text-base uppercase mt-2">
            Register Interest
          </a>
        </div>
      )}
    </nav>
  );
}