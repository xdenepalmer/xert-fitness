import React, { useState, useEffect } from 'react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import Countdown from '@/components/public/Countdown';
import BookingRequestForm from '@/components/public/BookingRequestForm';
import PTRequestForm from '@/components/public/PTRequestForm';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getClassSessions, getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';
import { classHasStarted } from '@/lib/bookingUi';

const CLASS_COLORS = {
  'XERT Foundation': 'border-green-600/40 text-green-400',
  'XERT Strength': 'border-blue-600/40 text-blue-400',
  'XERT Engine': 'border-xert-orange/40 text-xert-orange',
  'XERT Hybrid': 'border-purple-600/40 text-purple-400',
  'XERT Event Prep': 'border-xert-red/40 text-xert-red',
  'XERT Team': 'border-yellow-600/40 text-yellow-400',
};

function ClassCard({ session, bookingsEnabled, onBook }) {
  const colorClass = CLASS_COLORS[session.class_type] || 'border-xert-steel/40 text-xert-concrete/60';
  const isFull = session.status === 'full';
  // Never offer a live request for a class that has already started, even if a
  // stale client still holds it. The public enquiry RLS policy has no time guard.
  const hasStarted = classHasStarted(session);
  const canRequest = bookingsEnabled && !isFull && !hasStarted;

  return (
    <div className={`bg-xert-ink border-l-2 ${isFull ? 'border-xert-steel/30 opacity-60' : 'border-xert-red'} p-5 hover:bg-xert-charcoal transition-colors`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-body text-xs border px-2 py-0.5 uppercase ${colorClass}`}>
              {session.class_type}
            </span>
            {session.beginner_friendly && (
              <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">
                Beginner friendly
              </span>
            )}
            {isFull && (
              <span className="font-body text-xs bg-xert-steel text-xert-ink px-2 py-0.5 uppercase">Full</span>
            )}
          </div>
          <h3 className="font-display text-xl text-xert-offwhite uppercase">{session.title}</h3>
        </div>
        {session.intensity_level && (
          <div className="text-right shrink-0">
            <p className="font-body text-xs text-xert-concrete/80 uppercase">Intensity</p>
            <p className="font-display text-sm text-xert-concrete/70 uppercase">{session.intensity_level}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <p className="font-body text-xs text-xert-concrete/80 uppercase tracking-wider">Date</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">
            {session.start_time ? new Date(session.start_time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBC'}
          </p>
        </div>
        <div>
          <p className="font-body text-xs text-xert-concrete/80 uppercase tracking-wider">Time</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">
            {session.start_time ? new Date(session.start_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : 'TBC'}
          </p>
        </div>
        <div>
          <p className="font-body text-xs text-xert-concrete/80 uppercase tracking-wider">Duration</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">{session.duration_minutes || '—'}min</p>
        </div>
        <div>
          <p className="font-body text-xs text-xert-concrete/80 uppercase tracking-wider">Capacity</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">{session.capacity || '—'}</p>
        </div>
      </div>

      {session.coach_name && (
        <p className="font-body text-sm text-xert-concrete/60 mb-4">
          Coach: <span className="text-xert-concrete/80">{session.coach_name}</span>
        </p>
      )}

      {canRequest && (
        <button onClick={() => onBook(session)}
          className="xert-btn-primary w-full py-3 font-display text-sm uppercase">
          Request spot
        </button>
      )}
      {bookingsEnabled && !hasStarted && isFull && (
        <button type="button" disabled aria-disabled="true"
          className="w-full py-3 border border-xert-deep/60 bg-xert-deep/20 text-xert-pale/40 font-display text-sm uppercase cursor-not-allowed">
          Class full
        </button>
      )}
      {bookingsEnabled && hasStarted && (
        <button type="button" disabled aria-disabled="true"
          className="w-full py-3 border border-xert-deep/60 bg-xert-deep/20 text-xert-pale/40 font-display text-sm uppercase cursor-not-allowed">
          Class started
        </button>
      )}
      {!bookingsEnabled && (
        <a href="/#eoi"
          className="xert-btn-ghost block text-center w-full py-3 font-display text-sm uppercase">
          Register interest
        </a>
      )}
    </div>
  );
}

export default function SoftLaunchTimetable() {
  const [sessions, setSessions] = useState([]);
  const [settings, setSettings] = useState(getDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showPTForm, setShowPTForm] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [ptSuccess, setPTSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      getClassSessions(true).catch(() => []),
      getSoftLaunchSettings().catch(() => getDefaultSettings()),
    ]).then(([s, cfg]) => {
      setSessions(s);
      setSettings(cfg);
      setLoading(false);
    });
  }, []);

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
        <Countdown targetDate={settings.target_launch_date || '2026-08-01'} enabled={settings.countdown_enabled !== false} />

        {/* Classes */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-2xl text-xert-offwhite uppercase">Published Classes</h2>
              {settings.bookings_enabled !== true && (
                <span className="font-body text-xs text-xert-concrete/70 border border-xert-steel/30 px-3 py-1 uppercase">
                  Bookings not yet open
                </span>
              )}
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
            ) : (
              <div className="space-y-3">
                {sessions.map(s => (
                  <ClassCard key={s.id} session={s} bookingsEnabled={settings.bookings_enabled === true} onBook={setSelectedSession} />
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
      <Dialog open={Boolean(selectedSession) && !bookingSuccess} onOpenChange={(open) => { if (!open) setSelectedSession(null); }}>
        <DialogContent
          aria-describedby={undefined}
          className="bg-xert-ink border-xert-steel/20 text-xert-pale rounded-none sm:rounded-none w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto p-6 gap-0"
        >
          <DialogHeader className="text-left mb-6">
            <DialogTitle className="font-display font-normal tracking-normal text-xl text-xert-offwhite uppercase">
              Request spot
            </DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <BookingRequestForm
              session={selectedSession}
              onSuccess={() => { setBookingSuccess(true); setSelectedSession(null); }}
              onCancel={() => setSelectedSession(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Booking success */}
      <Dialog open={bookingSuccess} onOpenChange={(open) => { if (!open) setBookingSuccess(false); }}>
        <DialogContent className="bg-xert-ink border-xert-steel/20 text-xert-pale rounded-none sm:rounded-none w-[calc(100%-2rem)] max-w-sm p-8 gap-0 text-center">
          <div className="w-12 h-12 bg-xert-steel/20 border-2 border-xert-red rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xert-red text-xl" aria-hidden="true">✓</span>
          </div>
          <DialogTitle className="font-display font-normal tracking-normal leading-none text-2xl text-xert-offwhite uppercase mb-2">
            Request received.
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-xert-concrete/60 mb-6">
            We'll confirm your spot before the class. Keep an eye on your email.
          </DialogDescription>
          <button onClick={() => setBookingSuccess(false)}
            className="xert-btn-primary mx-auto px-6 py-3 font-display text-sm uppercase">
            Done
          </button>
        </DialogContent>
      </Dialog>

      <PublicFooter />
      {/* Sticky "Book" CTA contradicts the soft-launch pause when bookings are off. */}
      {settings.bookings_enabled === true && <StickyMobileCTA />}
    </div>
  );
}