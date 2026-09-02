import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Tv } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { getAdminWorkout, getAdminWorkouts, saveWorkoutOfTheDay } from '@/lib/adminData';
import { brisbaneDateKey, normalizeWorkoutInput, WORKOUT_BODY_MAX } from '@/lib/workoutOfTheDay';
import { ADMIN_PAGE } from '@/components/admin/ui';

/** @param {boolean} _dirty */
const NOOP = _dirty => {};

const EMPTY = { title: '', body: '', published: false };

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const pad = value => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function labelForDate(dateKey, todayKey) {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === addDays(todayKey, 1)) return 'Tomorrow';
  if (dateKey === addDays(todayKey, -1)) return 'Yesterday';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export default function WorkoutManager({ onDirtyChange = NOOP }) {
  const todayKey = useMemo(() => brisbaneDateKey() || '', []);
  const [workoutDate, setWorkoutDate] = useState(todayKey);
  const [form, setForm] = useState(EMPTY);
  const [baseline, setBaseline] = useState(EMPTY);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const dirty = form.title !== baseline.title
    || form.body !== baseline.body
    || form.published !== baseline.published;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const load = useCallback(async (date) => {
    setLoading(true);
    setLoadError('');
    try {
      const [existing, list] = await Promise.all([getAdminWorkout(date), getAdminWorkouts()]);
      const next = existing
        ? { title: existing.title || '', body: existing.body || '', published: Boolean(existing.published_at) }
        : EMPTY;
      setForm(next);
      setBaseline(next);
      setRecent(list);
    } catch (error) {
      setLoadError(error.message || 'Could not load workouts. Check admin permissions and that the workout table exists.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (workoutDate) load(workoutDate); }, [workoutDate, load]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = normalizeWorkoutInput({ ...form, workout_date: workoutDate });
      const saved = await saveWorkoutOfTheDay(normalized);
      const next = {
        title: saved.title || '',
        body: saved.body || '',
        published: Boolean(saved.published_at),
      };
      setForm(next);
      setBaseline(next);
      setRecent(await getAdminWorkouts());
      toast({
        title: next.published ? 'Workout published' : 'Draft saved',
        description: next.published
          ? 'It is on the club TV within a minute.'
          : 'Not on the TV yet — publish when it is ready.',
      });
    } catch (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={ADMIN_PAGE}><div className="h-64 bg-xert-ink animate-pulse" /></div>;
  if (loadError) return <div className={ADMIN_PAGE}><AdminLoadError message={loadError} onRetry={() => load(workoutDate)} /></div>;

  const quickDays = [addDays(todayKey, -1), todayKey, addDays(todayKey, 1), addDays(todayKey, 2)];

  return (
    <div className={`${ADMIN_PAGE} max-w-3xl`}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <h2 className="font-display text-xl text-xert-offwhite uppercase">Workout Of The Day</h2>
        <a
          href="/display"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 px-4 font-body text-xs uppercase tracking-wider border border-xert-steel/40 text-xert-steel hover:border-xert-steel transition-colors"
        >
          <Tv className="w-4 h-4" aria-hidden="true" />
          Open TV display
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>
      <p className="font-body text-xs text-xert-concrete/50 mb-6">
        One workout per day, shown on every class that day. Cast <span className="text-xert-steel">/display</span> to the club TV once and leave it — it picks up changes on its own.
      </p>

      {dirty && (
        <div className="mb-4 px-4 py-3 border border-xert-steel/40 bg-xert-steel/10 font-body text-xs text-xert-pale" role="status">
          Unsaved changes. The TV will not update until you save.
        </div>
      )}

      <div className="bg-xert-ink border border-xert-steel/20 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {quickDays.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => setWorkoutDate(day)}
              aria-pressed={workoutDate === day}
              className={`min-h-11 px-3 py-2 text-sm font-body border transition-all ${
                workoutDate === day
                  ? 'border-xert-steel bg-xert-steel/10 text-xert-steel'
                  : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'
              }`}
            >
              {labelForDate(day, todayKey)}
            </button>
          ))}
          <label className="sr-only" htmlFor="workout-date">Workout date</label>
          <input
            id="workout-date"
            type="date"
            value={workoutDate}
            onChange={event => setWorkoutDate(event.target.value)}
            className="min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 font-body text-base text-xert-offwhite focus:outline-none focus:border-xert-steel"
          />
        </div>

        <label htmlFor="workout-title" className="block font-body text-xs text-xert-concrete/60 uppercase tracking-wider mb-2">
          Title <span className="normal-case tracking-normal text-xert-concrete/40">(optional)</span>
        </label>
        <input
          id="workout-title"
          value={form.title}
          onChange={event => set('title', event.target.value)}
          placeholder="e.g. Strength + Metcon"
          className="w-full min-h-11 bg-xert-charcoal border border-xert-steel/40 px-4 py-3 mb-5 font-body text-base text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-steel"
        />

        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="workout-body" className="block font-body text-xs text-xert-concrete/60 uppercase tracking-wider">
            The workout
          </label>
          <span className="font-body text-xs text-xert-concrete/40 tabular-nums">
            {form.body.length}/{WORKOUT_BODY_MAX}
          </span>
        </div>
        <textarea
          id="workout-body"
          value={form.body}
          onChange={event => set('body', event.target.value)}
          rows={12}
          placeholder={'A. Back squat 5x5\nB. 12 min AMRAP\n   10 wall balls\n   200m row'}
          className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-steel resize-y"
          style={{ minHeight: '18rem' }}
        />
        <p className="font-body text-xs text-xert-concrete/40 mt-2">
          Line breaks and indenting show exactly as you type them on the TV.
        </p>

        <div className="flex items-start justify-between gap-4 py-4 mt-2 border-t border-xert-steel/20">
          <div id="workout-published-description">
            <p className="font-body text-sm text-xert-offwhite">Show on the TV</p>
            <p className="font-body text-xs text-xert-concrete/40 mt-0.5">
              Off keeps it as a draft so you can write tomorrow&apos;s ahead of time.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.published}
            aria-labelledby="workout-published-description"
            onClick={() => set('published', !form.published)}
            className={`relative min-w-12 w-12 min-h-11 rounded-full transition-colors shrink-0 ${form.published ? 'bg-xert-steel' : 'bg-xert-steel/40'}`}
          >
            <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform ${form.published ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="xert-btn-primary w-full min-h-11 py-3 mt-2 font-display text-sm uppercase disabled:opacity-50"
        >
          {saving ? 'Saving…' : form.published ? 'Save & show on TV' : 'Save draft'}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="mt-8">
          <h3 className="font-body text-xs text-xert-concrete/60 uppercase tracking-wider mb-3">Recent workouts</h3>
          <ul className="divide-y divide-xert-steel/15 border border-xert-steel/20 bg-xert-ink">
            {recent.map(item => (
              <li key={item.workout_date}>
                <button
                  type="button"
                  onClick={() => setWorkoutDate(item.workout_date)}
                  className="w-full min-h-11 flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-xert-steel/5 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="font-body text-sm text-xert-offwhite">
                      {labelForDate(item.workout_date, todayKey)}
                    </span>
                    <span className="font-body text-xs text-xert-concrete/45 ml-2 truncate">
                      {item.title || item.body.split('\n')[0]}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-body text-[10px] uppercase tracking-wider px-2 py-1 border ${
                      item.published_at
                        ? 'border-xert-steel/50 text-xert-steel'
                        : 'border-xert-concrete/25 text-xert-concrete/45'
                    }`}
                  >
                    {item.published_at ? 'Live' : 'Draft'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
