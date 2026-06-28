import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';

export default function About() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>About</span>
        </div>

        <h1 className="font-display uppercase mb-8 text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}>
          About XERT Fitness
        </h1>

        <div className="space-y-5 font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.78)', fontSize: '1.0625rem' }}>
          <p>
            XERT Fitness is a new functional training facility opening in stages in Kingaroy, Queensland. We exist to help everyday people train with structure and purpose — not to be another commercial gym where you guess your way through a workout. Every class at XERT is coached and deliberately programmed, blending strength, power and conditioning built on real-world movement patterns. Our guiding idea is simple: beat your best, one session at a time.
        </p>
        <p>
          The facility is built around a twelve-month calendar of functional fitness, endurance, team and challenge events, so members always have a real goal ahead of them. Whether you are training for general fitness, preparing for a specific event, or chasing a strength milestone, your coach leads every session and helps you understand exactly what the goal in front of you requires. Allied health support — recovery, physiotherapy and nutrition partners — is integrated directly into the space, so improvement and longevity sit side by side.
        </p>
        <p>
          XERT is for the Kingaroy community in the broadest sense: emergency services and mine workers who need durable, shift-ready conditioning; teachers, hospital staff and council workers who want consistent structure around busy days; local sports teams chasing better conditioning blocks; and complete beginners alongside experienced athletes. Everyone is coached from the start, and standards rise with you.
        </p>
        <p>
          XERT Fitness is veteran owned and built on the values of discipline, structure, purpose, performance, resilience, community, education and preparation. We are currently registering foundation interest ahead of our August soft launch — early interest directly shapes class times, coaching demand, capacity and the first timetable.
        </p>
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