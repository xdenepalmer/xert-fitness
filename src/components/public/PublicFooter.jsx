import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { useSiteContent } from '@/lib/siteContent';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { CONTACT_DEFAULTS } from '@/lib/contentDefaults';

const LOGO = '/assets/xert-logo-stacked-light.png';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/#facility', label: 'Facility' },
  { to: '/timetable', label: 'Timetable' },
  { to: '/booking', label: 'Book & Buy Packs' },
  { to: '/coaches', label: 'Coaches' },
  { to: '/events', label: 'Event Calendar' },
  { to: '/about', label: 'About XERT' },
  { to: '/training-guide', label: 'Training Guide' },
  { to: '/app', label: 'iOS App' },
  { to: '/trainer-interest', label: 'Coach Interest' },
  { to: '/partner-interest', label: 'Partner / Allied Health' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicFooter() {
  const contact = useSiteContent('contact', CONTACT_DEFAULTS);
  const { isAdmin } = useSupabaseAuth();

  return (
    <footer
      data-public-footer
      className="pt-12 px-6 pb-12"
      style={{ backgroundColor: '#0d1720', borderTop: '1px solid rgba(123,167,188,0.1)' }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div>
            <img src={LOGO} alt="XERT Fitness. Beat Your Best." className="h-32 sm:h-36 w-auto mb-5 opacity-90" />
            <p className="font-body text-xs leading-relaxed mb-3 text-xert-pale/70">
              Semi-private functional fitness coaching in Kingaroy, Queensland. Beat Your Best.
            </p>
            <p className="font-body text-xs uppercase tracking-wider text-xert-steel">Train with purpose. Compete together.</p>
          </div>

          {/* Links */}
          <div>
            <p className="font-display text-xs uppercase tracking-widest mb-4 text-xert-steel">Navigate</p>
            <div className="space-y-2">
              {NAV_LINKS.map(l => (
                <Link key={l.to} to={l.to}
                  className="block font-body text-sm py-0.5 text-xert-pale/70 transition-colors hover:text-xert-steel">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact + CTA */}
          <div>
            <p className="font-display text-xs uppercase tracking-widest mb-4 text-xert-steel">Get In Touch</p>
            <div className="space-y-2 mb-5">
              <a href={`mailto:${contact.email}`}
                className="flex items-center gap-2 font-body text-sm py-0.5 text-xert-pale/70 transition-colors hover:text-xert-steel">
                <Mail className="w-3.5 h-3.5 shrink-0 text-xert-steel/80" aria-hidden="true" />
                {contact.email}
              </a>
              <a href={contact.instagram_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 font-body text-sm py-0.5 text-xert-pale/70 transition-colors hover:text-xert-steel">
                <Instagram className="w-3.5 h-3.5 shrink-0 text-xert-steel/80" aria-hidden="true" />
                {contact.instagram_handle}
              </a>
              <p className="flex items-center gap-2 font-body text-sm py-0.5 text-xert-pale/70">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-xert-steel/80" aria-hidden="true" />
                {contact.address}
              </p>
            </div>
            <Link to="/booking"
              className="xert-btn-primary inline-flex items-center px-5 py-3 font-display text-sm uppercase tracking-wide">
              Book Your First Session
            </Link>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(123,167,188,0.1)' }}>
          <p className="font-body text-xs text-xert-pale/70">
            © {new Date().getFullYear()} XERT Fitness, Kingaroy QLD 4610. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="font-body text-xs py-1 text-xert-pale/70 transition-colors hover:text-xert-steel">Privacy</Link>
            <Link to="/terms" className="font-body text-xs py-1 text-xert-pale/70 transition-colors hover:text-xert-steel">Terms</Link>
            {isAdmin && (
              <Link to="/admin"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-xert-steel/40 font-body text-xs uppercase tracking-wider text-xert-steel transition-colors hover:border-xert-steel hover:text-xert-pale">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Admin
              </Link>
            )}
            <p className="font-body text-xs text-xert-steel">
              Beat Your Best.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
