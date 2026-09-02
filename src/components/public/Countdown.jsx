import React, { useState, useEffect } from 'react';

import { countdownVisibility, DEFAULT_TARGET_LAUNCH_DATE } from '@/lib/launchSettings';

function getTimeLeft(targetDate) {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const diff = target - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

function CountUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-display tabular-nums text-xert-offwhite font-black"
        style={{ fontSize: 'clamp(2.25rem,9vw,4.5rem)', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-2 font-body text-[10px] uppercase tracking-[0.2em] text-xert-steel sm:text-xs">{label}</span>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="hidden font-display text-3xl text-xert-steel/30 sm:block sm:-mt-6">:</span>
  );
}

export default function Countdown({ targetDate = DEFAULT_TARGET_LAUNCH_DATE, enabled = true }) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
    return () => clearInterval(interval);
  }, [targetDate, enabled]);

  // Hidden once the date passes: the timer has nothing left to say, and it must
  // not invent an opening announcement on the gym's behalf.
  if (countdownVisibility(targetDate, enabled) !== 'counting') return null;

  return (
    <section className="xert-glow-center bg-xert-navy px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="xert-card-accent px-5 py-8 text-center sm:px-10 sm:py-12">
          <span className="xert-chip">Soft Launch Countdown</span>

          <div className="mt-7 grid grid-cols-4 items-center gap-2 sm:mt-9 sm:flex sm:justify-center sm:gap-8">
            <CountUnit value={timeLeft.days} label="Days" />
            <Separator />
            <CountUnit value={timeLeft.hours} label="Hours" />
            <Separator />
            <CountUnit value={timeLeft.minutes} label="Mins" />
            <Separator />
            <CountUnit value={timeLeft.seconds} label="Secs" />
          </div>

          <div className="mt-8 space-y-2">
            <p className="font-display text-xl uppercase tracking-wide text-xert-offwhite">Doors opening in stages.</p>
            <p className="mx-auto max-w-[40ch] font-body text-sm text-xert-pale/60">Foundation interest now open. Limited class capacity during the first stage.</p>
          </div>

          <div className="mt-7 flex justify-center">
            <a href="#eoi"
              className="xert-btn-primary inline-flex min-h-[52px] w-full items-center justify-center px-8 py-3.5 font-display text-lg uppercase tracking-wide sm:w-auto sm:py-4">
              Join the foundation list
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
