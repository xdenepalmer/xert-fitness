import React, { useState, useEffect } from 'react';
import { CalendarDays, List } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import Countdown from '@/components/public/Countdown';
import { DEFAULT_TARGET_LAUNCH_DATE, fitboxHandoff } from '@/lib/launchSettings';
import BookingRequestForm from '@/components/public/BookingRequestForm';
import PTRequestForm from '@/components/public/PTRequestForm';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import ClassSessionCard from '@/components/public/ClassSessionCard';
import PublicClassCalendar from '@/components/public/PublicClassCalendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getClassSessions, getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';
import { getPublicClassAvailability } from '@/lib/submitForms';
import { classSignupState, signupOutcomeMessage } from '@/lib/classSignup';

export default function SoftLaunchTimetable() {
  const [sessions, setSessions] = useState([]);
  const [settings, setSettings] = useState(getDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showPTForm, setShowPTForm] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [availability, setAvailability] = useState({});
  const [ptSuccess, setPTSuccess] = useState(false);
  const [view, setView] = useState('calendar');
  const fitbox = fitboxHandoff(settings);

  useEffect(() => {
    Promise.all([
      getClassSessions(true).catch(() => []),
      getSoftLaunchSettings().catch(() => getDefaultSettings()),
      // Live remaining places. Failing here only hides spot counts; the
      // database still refuses a sign-up once a class is full.
      getPublicClassAvailability().catch(() => ({})),
    ]).then(([s, cfg, places]) => {
      setSessions(s);
      setSettings(cfg);
      setAvailability(places);
      setLoading(false);
    });
  }, []);

  // Re-read remaining places after a sign-up so other visitors on this page
  // see the spot disappear without a reload.
  const refreshAvailability = () => {
    getPublicClassAvailability().then(setAvailability).catch(() => {});
  };

  const selectedSignup = classSignupState({
    session: selectedSession || {},
    availability: selectedSession ? availability[selectedSession.id] : null,
    bookingsEnabled: settings.bookings_enabled,
    fitbox,
  });
  const successCopy = signupOutcomeMessage(bookingSuccess);

  return (
    <div className="bg-xert-black min-h-screen flex flex-col">
      <PublicNav />

      <main id="main" className="flex-1 pt-16">
        {/* Header */}
        <section className="bg-xert-ink border-b border-xert-steel/20 py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-0.5 w-6 bg-xert-steel" />
              <span className="font-body text-xs text-xert-red uppercase tracking-[0.2em]">Soft Launch</span>
            </div>
            <h1 className="font-display text-[clamp(2rem,6vw,4rem)] leading-tight text-xert-offwhite uppercase mb-4">
              Timetable &<br />
              <span className="text-xert-concrete/50">Launch Plan.</span>
            </h1>
            <p className="font-body text-base text-xert-concrete/70 leading-relaxed max-w-xl">
              XERT will open in stages. During the first phase, class capacity may be limited while the full facility continues to take shape. Register interest early to secure your spot.
            </p>
            {settings.show_limited_capacity_badge && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 border border-xert-orange/40">
                <span className="w-1.5 h-1.5 rounded-full bg-xert-orange" />
                <span className="font-body text-xs text-xert-orange uppercase tracking-wider">Limited foundation capacity</span>
              </div>
            )}
          </div>
        </section>

        {/* Countdown */}
        <Countdown targetDate={settings.target_launch_date || DEFAULT_TARGET_LAUNCH_DATE} enabled={settings.countdown_enabled !== false} />

        {/* Classes */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <h2 className="font-display text-2xl text-xert-offwhite uppercase">What&rsquo;s On</h2>
              <div className="flex flex-wrap items-center gap-3">
                {fitbox.active ? (
                  <a href={fitbox.url} target="_blank" rel="noopener noreferrer"
                    className="font-body text-xs text-xert-steel border border-xert-steel/40 px-3 py-1 uppercase hover:border-xert-steel transition-colors">
                    Book via the XERT member portal
                  </a>
                ) : !settings.bookings_enabled && (
                  <span className="font-body text-xs text-xert-concrete/40 border border-xert-steel/30 px-3 py-1 uppercase">
                    Bookings not yet open
                  </span>
                )}
                <div className="flex" role="group" aria-label="Timetable view">
                  {[
                    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
                    { key: 'list', label: 'List', icon: List },
                  ].map(option => (
                    <button key={option.key} type="button" onClick={() => setView(option.key)} aria-pressed={view === option.key}
                      className={`inline-flex min-h-11 items-center gap-1.5 border px-3 font-body text-xs uppercase tracking-wider transition-colors -ml-px first:ml-0
                        ${view === option.key ? 'border-xert-steel bg-xert-steel/15 text-xert-offwhite' : 'border-xert-steel/25 text-xert-concrete/50 hover:border-xert-steel'}`}>
                      <option.icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center">
                <div className="w-6 h-6 border-2 border-xert-steel/30 border-t-xert-red rounded-full animate-spin mx-auto" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-16 text-center border border-xert-steel/20">
                <p className="font-display text-xl text-xert-offwhite uppercase mb-3">Timetable coming soon</p>
                <p className="font-body text-sm text-xert-concrete/50 mb-8">
                  Classes will be published here before the August soft launch. Register your interest now to be notified first.
                </p>
                <a href="/#eoi"
                  className="xert-btn-primary inline-flex items-center justify-center px-8 py-3 font-display text-sm uppercase">
                  Register interest
                </a>
              </div>
            ) : view === 'calendar' ? (
              <PublicClassCalendar
                sessions={sessions}
                bookingsEnabled={settings.bookings_enabled}
                onBook={setSelectedSession}
                fitbox={fitbox}
                availability={availability}
              />
            ) : (
              <div className="space-y-3">
                {sessions.map(s => (
                  <ClassSessionCard key={s.id} session={s} bookingsEnabled={settings.bookings_enabled}
                    onBook={setSelectedSession} fitbox={fitbox} availability={availability[s.id]} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PT Section */}
        <section className="bg-xert-charcoal py-16 px-6 border-t border-xert-steel/20">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-2xl text-xert-offwhite uppercase mb-3">Personal Training</h2>
            <p className="font-body text-sm text-xert-concrete/60 mb-6">
              Looking for 1-on-1 coaching? Request a PT session and we'll be in touch to confirm availability.
            </p>
            {!showPTForm && !ptSuccess && (
              <button onClick={() => setShowPTForm(true)}
                className="xert-btn-primary px-8 py-3 font-display text-base uppercase">
                Request PT session
              </button>
            )}
            {showPTForm && !ptSuccess && (
              <div className="bg-xert-ink border border-xert-steel/20 p-6 sm:p-8 text-left mt-6">
                <PTRequestForm onSuccess={() => { setPTSuccess(true); setShowPTForm(false); }} />
              </div>
            )}
            {ptSuccess && (
              <div className="bg-xert-ink border border-xert-steel/20 p-8 text-center">
                <p className="font-display text-xl text-xert-offwhite uppercase mb-2">PT request received.</p>
                <p className="font-body text-sm text-xert-concrete/60">We'll be in touch to confirm your session.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Booking modal */}
      <Dialog open={Boolean(selectedSession)} onOpenChange={(open) => { if (!open) setSelectedSession(null); }}>
        <DialogContent
          aria-describedby={undefined}
          className="bg-xert-ink border-xert-steel/20 text-xert-pale rounded-none sm:rounded-none w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto p-6 gap-0"
        >
          <DialogHeader className="text-left mb-6">
            <DialogTitle className="font-display font-normal tracking-normal text-xl text-xert-offwhite uppercase">
              {selectedSignup.label}
            </DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <BookingRequestForm
              session={selectedSession}
              submitLabel={selectedSignup.label}
              busyLabel={selectedSignup.takesSpot ? 'Taking your spot...' : 'Submitting...'}
              takesSpot={selectedSignup.takesSpot}
              consentLabel={selectedSignup.takesSpot
                ? 'I consent to XERT contacting me about this class.'
                : 'I consent to XERT contacting me about this booking request.'}
              onSuccess={result => { setBookingSuccess(result || {}); setSelectedSession(null); refreshAvailability(); }}
              onCancel={() => setSelectedSession(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Booking success */}
      <Dialog open={Boolean(bookingSuccess)} onOpenChange={(open) => { if (!open) setBookingSuccess(null); }}>
        <DialogContent className="bg-xert-ink border-xert-steel/20 text-xert-pale rounded-none sm:rounded-none w-[calc(100%-2rem)] max-w-sm p-8 gap-0 text-center">
          <div className="w-12 h-12 bg-xert-steel/20 border-2 border-xert-red rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xert-red text-xl" aria-hidden="true">✓</span>
          </div>
          <DialogTitle className="font-display font-normal tracking-normal leading-none text-2xl text-xert-offwhite uppercase mb-2">
            {successCopy.title}
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-xert-concrete/60 mb-6">
            {successCopy.body}
          </DialogDescription>
          <button onClick={() => setBookingSuccess(null)}
            className="xert-btn-primary mx-auto px-6 py-3 font-display text-sm uppercase">
            Done
          </button>
        </DialogContent>
      </Dialog>

      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}