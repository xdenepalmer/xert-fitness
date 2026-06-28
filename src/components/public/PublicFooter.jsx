import React from 'react';
import { Link } from 'react-router-dom';

export default function PublicFooter() {
  return (
    <footer className="bg-xert-ink border-t border-xert-steel/20 py-12 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="mb-4">
              <span className="font-display text-3xl text-xert-offwhite font-black uppercase block">XERT</span>
              <span className="font-display text-xs text-xert-concrete/40 uppercase tracking-widest">FITNESS</span>
            </div>
            <p className="font-body text-xs text-xert-concrete/50 leading-relaxed">
              A new functional training facility opening in Kingaroy, Queensland. Soft launch August.
            </p>
            <p className="font-body text-xs text-xert-concrete/30 mt-3 uppercase tracking-wider">Veteran owned.</p>
          </div>

          {/* Links */}
          <div>
            <p className="font-display text-xs text-xert-concrete/40 uppercase tracking-widest mb-4">Navigate</p>
            <div className="space-y-2">
              {[
                { to: '/', label: 'Home' },
                { to: '/timetable', label: 'Soft Launch / Timetable' },
                { to: '/trainer-interest', label: 'Coach Interest' },
                { to: '/partner-interest', label: 'Partner / Allied Health' },
              ].map(l => (
                <Link key={l.to} to={l.to} className="block font-body text-sm text-xert-concrete/60 hover:text-xert-red transition-colors">{l.label}</Link>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div>
            <p className="font-display text-xs text-xert-concrete/40 uppercase tracking-widest mb-4">Foundation List</p>
            <p className="font-body text-sm text-xert-concrete/60 mb-4">
              Register your interest to help shape the soft launch timetable and class capacity.
            </p>
            <a href="#eoi"
              className="inline-flex items-center px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
              Register interest
            </a>
          </div>
        </div>

        <div className="border-t border-xert-steel/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-body text-xs text-xert-concrete/30">
            XERT Fitness, Kingaroy QLD. Soft launch August.
          </p>
          <p className="font-body text-xs text-xert-concrete/20">
            Train toward something.
          </p>
        </div>
      </div>
    </footer>
  );
}