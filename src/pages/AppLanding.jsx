import React from 'react';
import { CalendarDays, BellRing, CreditCard, Target, Trophy, WifiOff } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Book Classes',
    copy: 'Browse the live timetable and lock in your spot straight from your phone — instant bookings or requests, exactly like the website.',
  },
  {
    icon: CreditCard,
    title: 'Session Credits',
    copy: 'See your session pack balance at a glance and know exactly what every booking uses before you confirm.',
  },
  {
    icon: Target,
    title: 'Training Goals',
    copy: 'Set goals with your coach and track them between sessions, so every visit builds on the last one.',
  },
  {
    icon: Trophy,
    title: 'Events',
    copy: 'Follow XERT events and challenges, register your goals and keep the big dates in front of you.',
  },
  {
    icon: BellRing,
    title: 'Class Reminders',
    copy: 'Optional reminders before your booked classes mean you never miss a warm-up.',
  },
  {
    icon: WifiOff,
    title: 'Works Offline',
    copy: 'Your timetable and bookings stay readable even with patchy reception — the app catches up when you are back online.',
  },
];

export default function AppLanding() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />
      <main id="main" className="pb-20">
        <PageHeader
          eyebrow="iOS App"
          title="XERT In Your"
          accent="Pocket"
          intro="The XERT Fitness app for iPhone puts your bookings, session credits, training goals and event calendar in one place — built dark, sharp and fast, just like the gym."
          containerClassName="max-w-5xl"
        />

        <div className="max-w-5xl mx-auto px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {FEATURES.map(({ icon: Icon, title, copy }) => (
            <div
              key={title}
              className="p-6"
              style={{ backgroundColor: '#0b1218', border: '1px solid rgba(123,167,188,0.18)' }}
            >
              <Icon className="w-6 h-6 mb-4" style={{ color: '#7BA7BC' }} aria-hidden="true" />
              <h2 className="font-display uppercase text-xl tracking-wide text-xert-offwhite mb-2">{title}</h2>
              <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.7)' }}>{copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 p-8" style={{ backgroundColor: '#0b1218', border: '1px solid rgba(123,167,188,0.18)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
            <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Beta</span>
          </div>
          <h2 className="font-display uppercase text-3xl text-xert-offwhite mb-3">Now Testing On TestFlight</h2>
          <p className="font-body leading-relaxed max-w-2xl mb-8" style={{ color: 'rgba(209,221,230,0.78)' }}>
            The app is in beta ahead of the XERT launch. Members and early supporters can help
            test it — create your member account, then ask us for a TestFlight invite. The App
            Store release lands with the gym opening.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="/register"
              className="xert-btn-primary inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide"
            >
              Create Member Account
            </a>
            <a
              href="/contact"
              className="xert-btn-ghost inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide"
            >
              Request A Beta Invite
            </a>
          </div>
        </div>

        <p className="font-body text-xs mt-8" style={{ color: 'rgba(209,221,230,0.45)' }}>
          Requires iPhone with iOS 16 or later. Read how the app handles your data in the{' '}
          <a href="/privacy" className="underline" style={{ color: '#7BA7BC' }}>Privacy Policy</a>.
        </p>
        </div>
      </main>
      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}
