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
      <span className="font-display text-[clamp(2.5rem,10vw,5rem)] leading-none tabular-nums text-xert-offwhite font-black">
        {String(value).padStart(2, '0')}
      </span>
      <span className="font-body text-xs text-xert-concrete/50 uppercase tracking-[0.2em] mt-2">{label}</span>
    </div>
  );
}

export default function Countdown({ targetDate = '2026-08-01', enabled = true }) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate, enabled]);

  if (!enabled) return null;

  return (
    <section className="bg-xert-ink border-y border-xert-steel/20 py-16 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="h-px flex-1 bg-xert-steel/30" />
          <span className="font-body text-xs text-xert-red uppercase tracking-[0.25em]">Soft Launch Countdown</span>
          <div className="h-px flex-1 bg-xert-steel/30" />
        </div>

        {timeLeft.launched ? (
          <div className="text-center">
            <p className="font-display text-5xl text-xert-red uppercase">We're Open</p>
            <p className="font-body text-xert-concrete/70 mt-2">XERT Fitness is now open. Welcome to Kingaroy's newest training facility.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-4 sm:gap-8 mb-10">
              <CountUnit value={timeLeft.days} label="Days" />
              <span className="font-display text-3xl text-xert-steel mb-4">:</span>
              <CountUnit value={timeLeft.hours} label="Hours" />
              <span className="font-display text-3xl text-xert-steel mb-4">:</span>
              <CountUnit value={timeLeft.minutes} label="Mins" />
              <span className="font-display text-3xl text-xert-steel mb-4">:</span>
              <CountUnit value={timeLeft.seconds} label="Secs" />
            </div>

            <div className="text-center space-y-2 mb-8">
              <p className="font-display text-xl text-xert-offwhite uppercase tracking-wide">Doors opening in stages.</p>
              <p className="font-body text-sm text-xert-concrete/60">Foundation interest now open. Limited class capacity during the first stage.</p>
            </div>

            <div className="flex justify-center">
              <a href="#eoi"
                className="inline-flex items-center justify-center px-8 py-4 bg-xert-red text-white font-display text-lg uppercase tracking-wide hover:bg-xert-orange transition-colors">
                Join the foundation list
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}