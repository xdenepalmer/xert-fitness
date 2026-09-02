import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink, Mail, MapPin, Phone, Instagram } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import { useSiteContent } from '@/lib/siteContent';
import { CONTACT_DEFAULTS, HERO_DEFAULTS, HERO_PHOTOS } from '@/lib/contentDefaults';

const KINGAROY_MAP_EMBED = 'https://www.openstreetmap.org/export/embed.html?bbox=151.8100%2C-26.5550%2C151.8700%2C-26.5050&layer=mapnik';
const KINGAROY_MAP_LINK = 'https://www.openstreetmap.org/#map=14/-26.5309/151.8400';

const rowClasses = 'xert-card flex items-center gap-4 p-4 sm:p-5 transition-colors hover:border-xert-steel/40';

export default function Contact() {
  const content = useSiteContent('contact', CONTACT_DEFAULTS);
  const heroContent = useSiteContent('hero', HERO_DEFAULTS);
  const galleryPhotos = (heroContent.photos?.length ? heroContent.photos : HERO_PHOTOS).slice(0, 3);
  return (
    <div className="min-h-screen bg-xert-navy">
      <PublicNav />
      <main id="main" className="pb-20">
        <PageHeader eyebrow="Contact" title="Get in" accent="Touch" intro={content.intro} containerClassName="max-w-6xl" />

        <div className="max-w-6xl mx-auto px-6">
        <section aria-labelledby="contact-gallery-title" className="mt-8 mb-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2 id="contact-gallery-title" className="font-display text-2xl uppercase text-xert-offwhite">Train with XERT</h2>
            <span className="font-body text-[11px] uppercase tracking-wider text-xert-steel">Coaching · Strength · Community</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {galleryPhotos.map((photo, index) => (
              <figure key={`${photo}-${index}`} className={`relative overflow-hidden rounded-2xl ${index === 0 ? 'col-span-2 md:col-span-1' : ''}`} style={{ aspectRatio: index === 0 ? '4 / 3' : '3 / 4' }}>
                <img src={photo} alt={index === 0 ? 'XERT functional fitness coaching' : 'Training at XERT Fitness'} loading="lazy" className="w-full h-full object-cover" style={{ filter: 'saturate(0.72) brightness(0.78)' }} />
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(16,24,32,0.55))' }} />
              </figure>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-8 items-start">
          <div className="space-y-3">
          {/* Email */}
          <a href={`mailto:${content.email}`} className={`${rowClasses} group`}>
            <span className="xert-icon-tile" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
              <Mail className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base uppercase text-xert-offwhite leading-none">Email Us</p>
              <p className="font-body text-sm mt-1 truncate text-xert-steel">{content.email}</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 text-xert-steel/60 group-hover:text-xert-steel transition-colors" aria-hidden="true" />
          </a>

          {/* Phone (only when provided via CMS) */}
          {content.phone && (
            <a href={`tel:${content.phone.replace(/\s+/g, '')}`} className={`${rowClasses} group`}>
              <span className="xert-icon-tile">
                <Phone className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base uppercase text-xert-offwhite leading-none">Call Us</p>
                <p className="font-body text-sm mt-1 text-xert-steel">{content.phone}</p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 text-xert-steel/60 group-hover:text-xert-steel transition-colors" aria-hidden="true" />
            </a>
          )}

          {/* Location */}
          <a href={KINGAROY_MAP_LINK} target="_blank" rel="noopener noreferrer" className={`${rowClasses} group`}>
            <span className="xert-icon-tile">
              <MapPin className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base uppercase text-xert-offwhite leading-none">Location</p>
              <p className="font-body text-sm mt-1 text-xert-pale/65">{content.address}</p>
            </div>
            <ExternalLink className="w-4 h-4 shrink-0 text-xert-steel" />
          </a>

          {/* Social */}
          <div className={rowClasses}>
            <span className="xert-icon-tile">
              <Instagram className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base uppercase text-xert-offwhite leading-none mb-1">Follow Along</p>
              <a href={content.instagram_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-body text-sm text-xert-steel hover:text-xert-pale transition-colors">{content.instagram_handle}</a>
            </div>
          </div>
          </div>

          <section aria-labelledby="kingaroy-map-title" className="xert-card overflow-hidden">
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div>
                <p className="font-body text-[10px] uppercase tracking-[0.2em] text-xert-steel">South Burnett</p>
                <h2 id="kingaroy-map-title" className="font-display text-2xl uppercase text-xert-offwhite">Kingaroy Area</h2>
              </div>
              <a href={KINGAROY_MAP_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-body text-xs uppercase tracking-wider text-xert-steel hover:text-xert-pale transition-colors">
                Open map <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <iframe title="Map of the Kingaroy Queensland area" src={KINGAROY_MAP_EMBED} loading="lazy" referrerPolicy="no-referrer" className="block w-full border-0 grayscale contrast-90 h-[20rem] sm:h-[28rem]" />
            <p className="p-4 sm:p-5 font-body text-xs leading-relaxed text-xert-pale/50">The exact facility address and arrival details are provided with confirmed bookings.</p>
          </section>
        </div>

        <div className="mt-12">
          <div className="xert-divider mb-8" />
          <Link to="/booking"
            className="xert-btn-primary inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-8 font-display text-lg uppercase tracking-wide">
            Book Your First Session
          </Link>
        </div>
        </div>
      </main>
      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}
