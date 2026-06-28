import React from 'react';
import { Mail, MapPin, Instagram, Facebook } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';

const CONTACT_EMAIL = 'hello@xertfitness.com.au';

export default function Contact() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Contact</span>
        </div>

        <h1 className="font-display uppercase mb-8 text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}>
          Get in Touch
        </h1>

        <p className="font-body leading-relaxed mb-10" style={{ color: 'rgba(209,221,230,0.75)', fontSize: '1.0625rem', maxWidth: '50ch' }}>
          Have a question about classes, coaching, allied health partnerships or the August soft launch? Reach out — we'd love to hear from you and help you plan your training.
        </p>

        <div className="space-y-4">
          {/* Email */}
          <a href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center gap-4 p-5 border transition-colors group"
            style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(50,72,90,0.15)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7BA7BC'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.18)'}>
            <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: '#7BA7BC' }}>
              <Mail className="w-5 h-5" style={{ color: '#101820' }} />
            </div>
            <div>
              <p className="font-display text-base uppercase text-xert-offwhite leading-none">Email Us</p>
              <p className="font-body text-sm mt-1" style={{ color: '#7BA7BC' }}>{CONTACT_EMAIL}</p>
            </div>
          </a>

          {/* Location */}
          <div className="flex items-center gap-4 p-5 border"
            style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(50,72,90,0.15)' }}>
            <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }}>
              <MapPin className="w-5 h-5" style={{ color: '#7BA7BC' }} />
            </div>
            <div>
              <p className="font-display text-base uppercase text-xert-offwhite leading-none">Location</p>
              <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.6)' }}>Kingaroy, Queensland</p>
            </div>
          </div>

          {/* Social */}
          <div className="flex items-center gap-4 p-5 border"
            style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(50,72,90,0.15)' }}>
            <div className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }}>
              <Instagram className="w-5 h-5" style={{ color: '#7BA7BC' }} />
            </div>
            <div className="flex-1">
              <p className="font-display text-base uppercase text-xert-offwhite leading-none mb-2">Follow Along</p>
              <div className="flex items-center gap-4">
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
                  className="font-body text-sm transition-colors" style={{ color: '#7BA7BC' }}>Instagram</a>
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"
                  className="font-body text-sm transition-colors flex items-center gap-1.5" style={{ color: '#7BA7BC' }}>
                  <Facebook className="w-3.5 h-3.5" /> Facebook
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(123,167,188,0.12)' }}>
          <a href="/#eoi"
            className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
            Register Foundation Interest
          </a>
        </div>
      </main>
      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}