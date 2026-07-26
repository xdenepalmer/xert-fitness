import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Mail, MapPin, Phone, Instagram } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import { useSiteContent } from '@/lib/siteContent';
import { CONTACT_DEFAULTS, HERO_DEFAULTS, HERO_PHOTOS } from '@/lib/contentDefaults';
import { getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';

const KINGAROY_MAP_EMBED = 'https://www.openstreetmap.org/export/embed.html?bbox=151.8100%2C-26.5550%2C151.8700%2C-26.5050&layer=mapnik';
const KINGAROY_MAP_LINK = 'https://www.openstreetmap.org/#map=14/-26.5309/151.8400';

export default function Contact() {
  const content = useSiteContent('contact', CONTACT_DEFAULTS);
  const heroContent = useSiteContent('hero', HERO_DEFAULTS);
  const galleryPhotos = (heroContent.photos?.length ? heroContent.photos : HERO_PHOTOS).slice(0, 3);
  const [settings, setSettings] = useState(getDefaultSettings());
  // Fail closed: Book CTAs stay off until launch settings confirm bookings_enabled
  // (Home / Soft Launch timetable parity).
  const bookingsEnabled = settings.bookings_enabled === true;

  useEffect(() => {
    getSoftLaunchSettings().then(s => { if (s) setSettings(s); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main id="main" className="pb-20">
        <PageHeader eyebrow="Contact" title="Get in" accent="Touch" intro={content.intro} containerClassName="max-w-6xl" />

        <div className="max-w-6xl mx-auto px-6">
        <section aria-labelledby="contact-gallery-title" className="mt-8 mb-12">
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <h2 id="contact-gallery-title" className="font-display text-2xl uppercase text-xert-offwhite">Train with XERT</h2>
            <span className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>Coaching · Strength · Community</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {galleryPhotos.map((photo, index) => (
              <figure key={`${photo}-${index}`} className={`relative overflow-hidden ${index === 0 ? 'col-span-2 md:col-span-1' : ''}`} style={{ aspectRatio: index === 0 ? '4 / 3' : '3 / 4' }}>
                <img src={photo} alt={index === 0 ? 'XERT functional fitness coaching' : 'Training at XERT Fitness'} loading="lazy" className="w-full h-full object-cover" style={{ filter: 'saturate(0.72) brightness(0.78)' }} />
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(16,24,32,0.55))' }} />
              </figure>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-8 items-start">
          <div className="space-y-4">
          {/* Email */}
          <a href={`mailto:${content.email}`}
            className="flex items-center gap-4 p-5 border border-[rgba(123,167,188,0.18)] hover:border-xert-steel transition-colors group"
            style={{ backgroundColor: 'rgba(50,72,90,0.15)' }}>
            <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: '#7BA7BC' }}>
              <Mail className="w-5 h-5" style={{ color: '#101820' }} />
            </div>
            <div>
              <p className="font-display text-base uppercase text-xert-offwhite leading-none">Email Us</p>
              <p className="font-body text-sm mt-1" style={{ color: '#7BA7BC' }}>{content.email}</p>
            </div>
          </a>

          {/* Phone (only when provided via CMS) */}
          {content.phone && (
            <a href={`tel:${content.phone.replace(/\s+/g, '')}`}
              className="flex items-center gap-4 p-5 border border-[rgba(123,167,188,0.18)] hover:border-xert-steel transition-colors"
              style={{ backgroundColor: 'rgba(50,72,90,0.15)' }}>
              <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }}>
                <Phone className="w-5 h-5" style={{ color: '#7BA7BC' }} />
              </div>
              <div>
                <p className="font-display text-base uppercase text-xert-offwhite leading-none">Call Us</p>
                <p className="font-body text-sm mt-1" style={{ color: '#7BA7BC' }}>{content.phone}</p>
              </div>
            </a>
          )}

          {/* Location */}
          <a href={KINGAROY_MAP_LINK} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-5 border transition-colors"
            style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(50,72,90,0.15)' }}>
            <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }}>
              <MapPin className="w-5 h-5" style={{ color: '#7BA7BC' }} />
            </div>
            <div>
              <p className="font-display text-base uppercase text-xert-offwhite leading-none">Location</p>
              <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.6)' }}>{content.address}</p>
            </div>
            <ExternalLink className="w-4 h-4 ml-auto" style={{ color: '#7BA7BC' }} />
          </a>

          {/* Social */}
          <div className="flex items-center gap-4 p-5 border"
            style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(50,72,90,0.15)' }}>
            <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }}>
              <Instagram className="w-5 h-5" style={{ color: '#7BA7BC' }} />
            </div>
            <div className="flex-1">
              <p className="font-display text-base uppercase text-xert-offwhite leading-none mb-2">Follow Along</p>
              <a href={content.instagram_url} target="_blank" rel="noopener noreferrer"
                className="font-body text-sm transition-colors" style={{ color: '#7BA7BC' }}>{content.instagram_handle}</a>
            </div>
          </div>
          </div>

          <section aria-labelledby="kingaroy-map-title">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <p className="font-body text-[10px] uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>South Burnett</p>
                <h2 id="kingaroy-map-title" className="font-display text-2xl uppercase text-xert-offwhite">Kingaroy Area</h2>
              </div>
              <a href={KINGAROY_MAP_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                Open map <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <iframe title="Map of the Kingaroy Queensland area" src={KINGAROY_MAP_EMBED} loading="lazy" referrerPolicy="no-referrer" className="w-full border-0 grayscale contrast-90" style={{ height: '28rem' }} />
            <p className="mt-3 font-body text-xs leading-relaxed" style={{ color: 'rgba(209,221,230,0.45)' }}>The exact facility address and arrival details are provided with confirmed bookings.</p>
          </section>
        </div>

        <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(123,167,188,0.12)' }}>
          {bookingsEnabled ? (
            <Link to="/booking"
              className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide">
              Book Your First Session
            </Link>
          ) : (
            <Link to="/#eoi"
              className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide">
              Register interest
            </Link>
          )}
        </div>
        </div>
      </main>
      <PublicFooter showBookCta={bookingsEnabled} />
      {bookingsEnabled && <StickyMobileCTA />}
    </div>
  );
}
