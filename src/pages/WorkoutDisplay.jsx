import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getPublishedWorkout } from '@/lib/bookingData';
import {
  brisbaneClock,
  brisbaneDateKey,
  brisbaneDisplayDate,
  workoutBodyLines,
  workoutDisplayState,
} from '@/lib/workoutOfTheDay';

const LOGO = '/assets/xert-logo-horizontal-light.png';
const REFRESH_MS = 60_000;
const SCROLL_PIXELS_PER_SECOND = 26;
const SCROLL_HOLD_MS = 4_000;

/**
 * Full-screen kiosk for the in-club TV.
 *
 * Runs unattended for days: it re-derives the Brisbane day on every refresh so
 * midnight rollover is automatic, keeps the last good workout on screen if the
 * network drops mid-class, and never shows a workout from another day.
 */
export default function WorkoutDisplay() {
  const [now, setNow] = useState(() => new Date());
  const [workout, setWorkout] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  // Wall clock. A gym floor uses this for timing, so it ticks every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    const todayKey = brisbaneDateKey();
    try {
      const next = await getPublishedWorkout(todayKey);
      setWorkout(next);
      setLoadFailed(false);
    } catch {
      // Keep whatever is already on screen; only flag that it may be stale.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll so a coach's edit reaches the TV without anyone touching it.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const todayKey = brisbaneDateKey(now);
  const state = workoutDisplayState({ workout, todayKey, loadFailed });

  // Long workouts scroll themselves, then return to the top and repeat.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || state.status !== 'ready') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined;

    let frame = 0;
    let cancelled = false;
    const overflow = () => el.scrollHeight - el.clientHeight;
    if (overflow() <= 4) return undefined;

    let phaseStart = performance.now();
    let phase = 'hold-top';
    const step = timestamp => {
      if (cancelled) return;
      const elapsed = timestamp - phaseStart;
      const distance = overflow();
      if (phase === 'hold-top') {
        if (elapsed >= SCROLL_HOLD_MS) { phase = 'scroll'; phaseStart = timestamp; }
      } else if (phase === 'scroll') {
        const travelled = (elapsed / 1000) * SCROLL_PIXELS_PER_SECOND;
        el.scrollTop = Math.min(distance, travelled);
        if (travelled >= distance) { phase = 'hold-bottom'; phaseStart = timestamp; }
      } else if (elapsed >= SCROLL_HOLD_MS) {
        el.scrollTop = 0;
        phase = 'hold-top';
        phaseStart = timestamp;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [state.status, state.workout?.body, state.workout?.workout_date]);

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: '#101820' }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(123,167,188,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.05) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Header: brand, day, and the wall clock */}
      <header
        className="relative flex items-center justify-between gap-6 px-[3vw] pt-[2.5vh] pb-[1.5vh]"
        style={{ borderBottom: '1px solid rgba(123,167,188,0.22)' }}
      >
        <div className="flex items-center gap-[2vw] min-w-0">
          <img
            src={LOGO}
            alt="XERT Fitness"
            className="w-auto shrink-0"
            style={{ height: 'clamp(1.75rem, 3.6vw, 4.5rem)', filter: 'brightness(0) invert(1)' }}
          />
          <p
            className="font-body uppercase truncate"
            style={{
              color: 'rgba(209,221,230,0.65)',
              letterSpacing: '0.18em',
              fontSize: 'clamp(0.7rem, 1.5vw, 1.75rem)',
            }}
          >
            {brisbaneDisplayDate(now)}
          </p>
        </div>
        <div className="flex items-center gap-[1.2vw] shrink-0">
          {state.stale && (
            <span
              title="Showing the last known workout — reconnecting"
              className="rounded-full"
              style={{
                width: 'clamp(0.5rem, 0.9vw, 1rem)',
                height: 'clamp(0.5rem, 0.9vw, 1rem)',
                backgroundColor: '#E4B363',
              }}
            />
          )}
          <p
            className="font-display uppercase tabular-nums"
            style={{ color: '#7BA7BC', fontSize: 'clamp(1.75rem, 4.4vw, 5.5rem)', lineHeight: 1 }}
          >
            {brisbaneClock(now)}
          </p>
        </div>
      </header>

      <main className="relative flex-1 min-h-0 flex flex-col px-[3vw] py-[2.5vh]">
        {loading && state.status !== 'ready' ? null : state.status === 'ready' ? (
          <>
            <h1
              className="font-display uppercase shrink-0"
              style={{
                color: '#F1F3F4',
                fontSize: 'clamp(2.25rem, 6.4vw, 8rem)',
                lineHeight: 0.95,
                letterSpacing: '0.01em',
              }}
            >
              {state.workout.title || "Today's Workout"}
            </h1>
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-hidden mt-[2vh]"
              style={{ scrollbarWidth: 'none' }}
            >
              {workoutBodyLines(state.workout.body).map((line, index) => (
                <p
                  key={index}
                  className="font-body"
                  style={{
                    color: line ? 'rgba(241,243,244,0.94)' : 'transparent',
                    fontSize: 'clamp(1.15rem, 3.1vw, 3.75rem)',
                    lineHeight: 1.45,
                    minHeight: line ? undefined : 'clamp(0.6rem, 1.6vw, 1.9rem)',
                  }}
                >
                  {line || ' '}
                </p>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p
              className="font-display uppercase"
              style={{
                color: 'rgba(123,167,188,0.85)',
                fontSize: 'clamp(1.75rem, 5vw, 6rem)',
                lineHeight: 1,
              }}
            >
              {state.status === 'unavailable' ? 'Workout Unavailable' : "Today's Workout Is Coming"}
            </p>
            <p
              className="font-body mt-[2vh]"
              style={{
                color: 'rgba(209,221,230,0.55)',
                fontSize: 'clamp(0.9rem, 1.9vw, 2.25rem)',
              }}
            >
              {state.status === 'unavailable'
                ? 'Reconnecting to the XERT system.'
                : 'Your coach will have it up shortly.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
