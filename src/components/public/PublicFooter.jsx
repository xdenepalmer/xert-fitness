import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { useSiteContent } from '@/lib/siteContent';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

const LOGO = '/assets/xert-logo-full.png';

const CONTACT_DEFAULTS = {
  email: 'byronhawley@gmail.com',
  address: 'Kingaroy, Queensland 4610',
  instagram_handle: '@xert_fit',
  instagram_url: 'https://instagram.com/xert_fit',
};

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/#facility', label: 'Facility' },
  { to: '/timetable', label: 'Timetable' },
  { to: '/booking', label: 'Book & Buy Packs' },
  { to: '/coaches', label: 'Coaches' },
  { to: '/events', label: 'Event Calendar' },
  { to: '/about', label: 'About XERT' },
  { to: '/training-guide', label: 'Training Guide' },
  { to: '/trainer-interest', label: 'Coach Interest' },
  { to: '/partner-interest', label: 'Partner / Allied Health' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicFooter() {
  const contact = useSiteContent('contact', CONTACT_DEFAULTS);
  const { isAdmin } = useSupabaseAuth();

  return (
    <footer className="py-12 px-6" style={{ backgroundColor: '#0d1720', borderTop: '1px solid rgba(123,167,188,0.1)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div>
            <img src={LOGO} alt="XERT Fitness" className="h-8 w-auto mb-4 opacity-90"
              style={{ filter: 'brightness(0) invert(1)' }} />
            <p className="font-body text-xs leading-relaxed mb-3" style={{ color: 'rgba(209,221,230,0.5)' }}>
              Semi-private functional fitness coaching in Kingaroy, Queensland. Beat Your Best.
            </p>
            <p className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(123,167,188,0.4)' }}>Train with purpose. Compete together.</p>
          </div>

          {/* Links */}
          <div>
            <p className="font-display text-xs uppercase tracking-widest mb-4" style={{ color: 'rgba(123,167,188,0.5)' }}>Navigate</p>
            <div className="space-y-2">
              {NAV_LINKS.map(l => (
                <Link key={l.to} to={l.to}
                  className="block font-body text-sm transition-colors"
                  style={{ color: 'rgba(209,221,230,0.55)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#7BA7BC'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(209,221,230,0.55)'}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact + CTA */}
          <div>
            <p className="font-display text-xs uppercase tracking-widest mb-4" style={{ color: 'rgba(123,167,188,0.5)' }}>Get In Touch</p>
            <div className="space-y-2 mb-5">
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 font-body text-sm transition-colors"
                style={{ color: 'rgba(209,221,230,0.55)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#7BA7BC'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(209,221,230,0.55)'}>
                <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(123,167,188,0.5)' }} />
                {contact.email}
              </a>
              <a href={contact.instagram_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 font-body text-sm transition-colors"
                style={{ color: 'rgba(209,221,230,0.55)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#7BA7BC'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(209,221,230,0.55)'}>
                <Instagram className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(123,167,188,0.5)' }} />
                {contact.instagram_handle}
              </a>
              <p className="flex items-center gap-2 font-body text-sm" style={{ color: 'rgba(209,221,230,0.55)' }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(123,167,188,0.5)' }} />
                {contact.address}
              </p>
            </div>
            <a href="/booking"
              className="inline-flex items-center px-5 py-2.5 font-display text-sm uppercase tracking-wide transition-all"
              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1DDE6'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7BA7BC'}>
              Book Your First Session
            </a>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(123,167,188,0.1)' }}>
          <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.25)' }}>
            © {new Date().getFullYear()} XERT Fitness, Kingaroy QLD 4610. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link to="/admin"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border font-body text-xs uppercase tracking-wider transition-colors"
                style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(123,167,188,0.7)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7BA7BC'; e.currentTarget.style.color = '#7BA7BC'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.3)'; e.currentTarget.style.color = 'rgba(123,167,188,0.7)'; }}>
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </Link>
            )}
            <p className="font-body text-xs" style={{ color: 'rgba(123,167,188,0.2)' }}>
              Beat Your Best.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
