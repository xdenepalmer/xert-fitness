import React, { useState, useEffect } from 'react';

function getTimeLeft(targetDate) {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const diff = target - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, launched: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
    launched: false,
  };
}

function CountUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-display tabular-nums text-xert-offwhite font-black"
        style={{ fontSize: 'clamp(2.5rem,9vw,5rem)', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="font-body text-xs uppercase tracking-[0.2em] mt-2" style={{ color: '#7BA7BC' }}>{label}</span>
    </div>
  );
}

export default function Countdown({ targetDate = '2026-08-01', enabled = true }) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
    return () => clearInterval(interval);
  }, [targetDate, enabled]);

  if (!enabled) return null;

  return (
    <section className="py-16 px-6" style={{ backgroundColor: '#0d1720', borderTop: '1px solid rgba(123,167,188,0.1)', borderBottom: '1px solid rgba(123,167,188,0.1)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-px flex-1" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }} />
          <span className="font-body text-xs uppercase tracking-[0.25em]" style={{ color: '#7BA7BC' }}>Soft Launch Countdown</span>
          <div className="h-px flex-1" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }} />
        </div>

        {timeLeft.launched ? (
          <div className="text-center">
            <p className="font-display text-5xl text-xert-offwhite uppercase">We're Open</p>
            <p className="font-body mt-2" style={{ color: '#D1DDE6' }}>XERT Fitness is now open in Kingaroy.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-4 sm:gap-8 mb-10">
              <CountUnit value={timeLeft.days} label="Days" />
              <span className="font-display text-3xl mb-4" style={{ color: 'rgba(123,167,188,0.3)' }}>:</span>
              <CountUnit value={timeLeft.hours} label="Hours" />
              <span className="font-display text-3xl mb-4" style={{ color: 'rgba(123,167,188,0.3)' }}>:</span>
              <CountUnit value={timeLeft.minutes} label="Mins" />
              <span className="font-display text-3xl mb-4" style={{ color: 'rgba(123,167,188,0.3)' }}>:</span>
              <CountUnit value={timeLeft.seconds} label="Secs" />
            </div>

            <div className="text-center space-y-2 mb-8">
              <p className="font-display text-xl text-xert-offwhite uppercase tracking-wide">Doors opening in stages.</p>
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.6)' }}>Foundation interest now open. Limited class capacity during the first stage.</p>
            </div>

            <div className="flex justify-center">
              <a href="#eoi"
                className="inline-flex items-center justify-center px-8 py-4 font-display text-lg uppercase tracking-wide transition-all"
                style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1DDE6'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#7BA7BC'}>
                Join the foundation list
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}