import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const LOGO = 'https://media.base44.com/images/public/6a4099d07e981f3feabc1113/a1601f524_Logo_xert_final-01.png';

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
    { to: '/about', label: 'About' },
    { to: '/trainer-interest', label: 'Coaches' },
    { to: '/contact', label: 'Contact' },
  ];

  const navBg = scrolled
    ? 'bg-xert-navy border-b'
    : 'bg-transparent border-b border-transparent';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${navBg}`}
      style={{ borderColor: scrolled ? 'rgba(123,167,188,0.15)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img src={LOGO} alt="XERT Fitness" className="h-7 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }} />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              className="font-body text-sm uppercase tracking-wider transition-colors"
              style={{ color: location.pathname === l.to ? '#7BA7BC' : 'rgba(209,221,230,0.6)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#F1F3F4'}
              onMouseLeave={e => e.currentTarget.style.color = location.pathname === l.to ? '#7BA7BC' : 'rgba(209,221,230,0.6)'}>
              {l.label}
            </Link>
          ))}
          <a href="#eoi"
            className="ml-4 px-5 py-2 font-display text-sm uppercase tracking-wide transition-all"
            style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1DDE6'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7BA7BC'}>
            Register Interest
          </a>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2" style={{ color: 'rgba(209,221,230,0.7)' }}>
          <div className={`w-5 h-0.5 bg-current transition-all mb-1.5 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <div className={`w-5 h-0.5 bg-current transition-all mb-1.5 ${menuOpen ? 'opacity-0' : ''}`} />
          <div className={`w-5 h-0.5 bg-current transition-all ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t px-6 py-4 space-y-1"
          style={{ backgroundColor: '#101820', borderColor: 'rgba(123,167,188,0.15)' }}>
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
              className="block font-display text-xl uppercase py-2.5 transition-colors"
              style={{ color: location.pathname === l.to ? '#7BA7BC' : '#D1DDE6' }}>
              {l.label}
            </Link>
          ))}
          <a href="#eoi" onClick={() => setMenuOpen(false)}
            className="block w-full text-center py-3.5 font-display text-base uppercase mt-2"
            style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
            Register Interest
          </a>
        </div>
      )}
    </nav>
  );
}