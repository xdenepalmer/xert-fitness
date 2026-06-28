import React from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';

export default function ThankYou() {
  const shareText = encodeURIComponent("I just registered for XERT Fitness — a new functional training facility opening in Kingaroy. Soft launch August. Check it out.");
  const shareUrl = encodeURIComponent(window.location.origin);

  return (
    <div className="bg-xert-black min-h-screen flex flex-col">
      <PublicNav />

      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-lg w-full">
          {/* Accent */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-0.5 w-8 bg-xert-red" />
            <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Foundation List</span>
          </div>

          {/* Heading */}
          <h1 className="font-display text-[clamp(2.5rem,8vw,4rem)] leading-tight text-xert-offwhite uppercase mb-6">
            You're on the<br />
            <span className="text-xert-red">XERT foundation list.</span>
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
              className="flex-1 text-center py-3.5 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-concrete transition-colors">
              Back to home
            </Link>
            <Link to="/timetable"
              className="flex-1 text-center py-3.5 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-concrete transition-colors">
              View soft launch plan
            </Link>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center py-3.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
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