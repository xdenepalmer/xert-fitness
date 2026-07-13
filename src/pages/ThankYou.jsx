import React from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';

export default function ThankYou() {
  const shareText = encodeURIComponent("I just registered for XERT Fitness — a new functional training facility opening in Kingaroy. Soft launch August. Check it out.");
  const shareUrl = encodeURIComponent(window.location.origin);

  return (
    <div className="min-h-screen flex flex-col bg-xert-navy">
      <PublicNav />

      <main id="main" className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-lg w-full">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-6 bg-xert-steel" />
            <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Foundation List</span>
          </div>

          {/* Heading */}
          <h1 className="font-display text-[clamp(2.5rem,8vw,4rem)] leading-tight text-xert-offwhite uppercase mb-6">
            You're on the<br />
            <span className="text-xert-steel">XERT foundation list.</span>
          </h1>

          {/* Body */}
          <p className="font-body text-base text-xert-concrete/70 leading-relaxed mb-4">
            Thanks for registering your interest. Your response helps shape the soft launch timetable, class demand, coaching needs and foundation member planning.
          </p>
          <p className="font-body text-base text-xert-concrete/70 leading-relaxed mb-10">
            We'll share more as the August soft launch gets closer.
          </p>

          {/* Divider */}
          <div className="h-px bg-xert-steel/20 mb-8" />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/"
              className="xert-btn-ghost flex-1 text-center py-3.5 font-display text-sm uppercase">
              Back to home
            </Link>
            <Link to="/timetable"
              className="xert-btn-ghost flex-1 text-center py-3.5 font-display text-sm uppercase">
              View soft launch plan
            </Link>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}`}
              target="_blank" rel="noopener noreferrer"
              className="xert-btn-primary flex-1 text-center py-3.5 font-display text-sm uppercase">
              Share with a mate
            </a>
          </div>

          {/* Subtle tagline */}
          <p className="font-display text-xs text-xert-concrete/20 uppercase tracking-widest mt-10 text-center">
            Train toward something.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}