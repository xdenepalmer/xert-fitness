import React, { useEffect, useState } from 'react';
import { requestPrivateSession } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';
import { PT_SESSION_TYPES } from '@/lib/ptRequestAnalytics';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Flexible'];
const TIMES = ['Early morning (5–8am)', 'Morning (8–11am)', 'Lunch (11am–1pm)', 'Afternoon (1–5pm)', 'After work (5–7pm)', 'Evening (7pm+)', 'Flexible'];
const GOALS = ['Strength', 'Conditioning', 'Weight loss / body composition', 'Rehab / return to fitness', 'Event preparation', 'Sport performance', 'General health'];
const EXPERIENCE = ['Complete beginner', 'Some experience', 'Regular trainer', 'Advanced'];

const chipClasses = 'min-h-11 px-3 py-2 text-sm font-body rounded-full border transition-colors';
const chipActive = 'border-xert-steel bg-xert-steel text-xert-navy';
const chipIdle = 'border-xert-steel/30 bg-white/[0.03] text-xert-pale/75 hover:border-xert-steel';
const errorStyle = { color: '#f0a1a1', borderColor: 'rgba(240,161,161,0.35)', backgroundColor: 'rgba(240,161,161,0.08)' };

function FieldLabel({ children, required = false, htmlFor = undefined }) {
  const Component = htmlFor ? 'label' : 'span';
  return (
    <Component htmlFor={htmlFor} className="xert-label">
      {children}{required && <span className="text-xert-steel ml-1" aria-hidden="true">*</span>}
    </Component>
  );
}
function Input({ ...props }) {
  return (
    <input {...props} className="xert-input" />
  );
}

export default function PTRequestForm({ onSuccess }) {
  const { user, profile } = useSupabaseAuth();
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    requested_session_type: '', preferred_day: '', preferred_time: '',
    training_goal: '', experience_level: '', notes: '',
    consent_to_contact: false, company_website: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(current => ({
      ...current,
      full_name: current.full_name || profile?.full_name || user?.user_metadata?.full_name || '',
      email: current.email || user?.email || profile?.email || '',
      phone: current.phone || profile?.phone || '',
    }));
  }, [profile, user]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { setError('Valid email is required.'); return; }
    if (!form.phone.trim()) { setError('Phone is required.'); return; }
    if (!form.requested_session_type) { setError('Please select a session type.'); return; }
    if (!form.consent_to_contact) { setError('Consent to contact is required.'); return; }
    setLoading(true);
    setError('');
    try {
      await requestPrivateSession(form);
      onSuccess?.();
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
      {/* Honeypot must never be browser-autofilled: a filled value silently
          drops the submission server-side while the UI still reports success. */}
      <input type="text" name="company_website" value={form.company_website}
        onChange={e => set('company_website', e.target.value)} autoComplete="off"
        className="absolute opacity-0 h-0 w-0 pointer-events-none" tabIndex={-1} aria-hidden="true" />

      <div><FieldLabel htmlFor="pt-full-name" required>Full name</FieldLabel><Input id="pt-full-name" name="full_name" autoComplete="name" aria-required="true" placeholder="Your name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
      <div><FieldLabel htmlFor="pt-email" required>Email</FieldLabel><Input id="pt-email" name="email" autoComplete="email" aria-required="true" type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
      <div><FieldLabel htmlFor="pt-phone" required>Phone</FieldLabel><Input id="pt-phone" name="phone" autoComplete="tel" aria-required="true" type="tel" placeholder="Mobile" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>

      <fieldset aria-required="true">
        <legend className="xert-label">
          Session type<span className="text-xert-steel ml-1" aria-hidden="true">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PT_SESSION_TYPES.map(t => (
            <button type="button" key={t} onClick={() => set('requested_session_type', t)}
              aria-pressed={form.requested_session_type === t}
              className={`${chipClasses} ${form.requested_session_type === t ? chipActive : chipIdle}`}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="pt-preferred-day">Preferred day</FieldLabel>
          <select id="pt-preferred-day" name="preferred_day" value={form.preferred_day} onChange={e => set('preferred_day', e.target.value)}
            className="xert-input">
            <option value="">Any day</option>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="pt-preferred-time">Preferred time</FieldLabel>
          <select id="pt-preferred-time" name="preferred_time" value={form.preferred_time} onChange={e => set('preferred_time', e.target.value)}
            className="xert-input">
            <option value="">Any time</option>
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="xert-label">Training goal</legend>
        <div className="flex flex-wrap gap-2">
          {GOALS.map(g => (
            <button type="button" key={g} onClick={() => set('training_goal', g)}
              aria-pressed={form.training_goal === g}
              className={`${chipClasses} ${form.training_goal === g ? chipActive : chipIdle}`}>
              {g}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="xert-label">Experience level</legend>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE.map(exp => (
            <button type="button" key={exp} onClick={() => set('experience_level', exp)}
              aria-pressed={form.experience_level === exp}
              className={`${chipClasses} ${form.experience_level === exp ? chipActive : chipIdle}`}>
              {exp}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <FieldLabel htmlFor="pt-notes">Notes</FieldLabel>
        <textarea id="pt-notes" name="notes" value={form.notes} onChange={e => set('notes', e.target.value)}
          rows={2} placeholder="Anything you'd like the coach to know (optional)"
          className="xert-input resize-none" />
      </div>

      <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
        I consent to XERT contacting me about this PT request.
      </FormCheckbox>

      {error && (
        <div role="alert" className="rounded-xl border p-3" style={errorStyle}>
          <p className="font-body text-sm">{error}</p>
        </div>
      )}

      <button type="submit" disabled={loading}
        className="xert-btn-primary flex min-h-[52px] w-full items-center justify-center font-display text-base uppercase tracking-wide disabled:opacity-50">
        {loading ? 'Requesting...' : 'Request PT session'}
      </button>
    </form>
  );
}
