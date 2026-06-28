import React from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';

const sections = [
  {
    h: 'What is functional training?',
    p: 'Functional training builds strength, power and conditioning around movement patterns you use in everyday life and sport — squatting, hinging, pushing, pulling, carrying and sprinting. Instead of isolating single muscles on machines, functional sessions train the whole body to work together, which improves how you move, lift and recover outside the gym. At XERT Fitness in Kingaroy, every functional class is coached and programmed so each session has a clear intent rather than a random list of exercises.',
  },
  {
    h: 'How is XERT different from a commercial gym?',
    p: 'A commercial gym sells access to equipment and leaves the programming to you. XERT is coach-led: a qualified coach runs every class, scales movements to your level, and keeps the room training with purpose. Our programming runs in structured blocks, and the whole facility is organised around a twelve-month calendar of functional fitness, endurance, team and challenge events. That calendar gives members concrete goals to train toward, which is the single biggest driver of consistency and progress.',
  },
  {
    h: 'Who can train at XERT?',
    p: 'Everyone is welcome and everyone is coached from the start. Complete beginners learn the fundamentals safely, while experienced athletes are pushed against higher standards and event goals. XERT is built for the Kingaroy community — emergency services, mine workers, teachers, hospital and council staff, local sports teams, and anyone who simply wants to be fitter, stronger and more resilient. Sessions are scaled so the same class works for a first-timer and a seasoned competitor side by side.',
  },
  {
    h: 'Why train toward events?',
    p: 'Most people train harder and stay more consistent when there is something ahead of them. XERT structures membership around real events — functional fitness comps, endurance races, obstacle and challenge events, team challenges, charity fitness days and military-style endurance tests. Choosing a goal tells you what to train for, gives your coach a target to program around, and turns vague intentions into measurable progress. The result is training with direction instead of drift.',
  },
  {
    h: 'What does the soft launch involve?',
    p: 'XERT is opening in stages, beginning with an August soft launch. During this period we run a limited foundation timetable so we can coach well, gather feedback and refine class times before the full opening. Registering foundation interest now directly shapes the timetable, coaching demand and capacity — and gives early members priority as classes fill. Allied health partners, including recovery, physiotherapy and nutrition providers, are integrated from the start.',
  },
];

export default function TrainingGuide() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Training Guide</span>
        </div>

        <h1 className="font-display uppercase mb-8 text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}>
          Functional Training in Kingaroy
        </h1>

        <p className="font-body leading-relaxed mb-12" style={{ color: 'rgba(209,221,230,0.78)', fontSize: '1.0625rem' }}>
          A plain-language guide to how XERT Fitness trains, who it is for, and why coached, event-led functional training delivers better results than guessing your way through a commercial gym.
        </p>

        <div className="space-y-10">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="font-display text-2xl uppercase mb-3 text-xert-offwhite">{s.h}</h2>
              <p className="font-body leading-relaxed" style={{ color: 'rgba(209,221,230,0.72)', fontSize: '1rem' }}>{s.p}</p>
            </section>
          ))}
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