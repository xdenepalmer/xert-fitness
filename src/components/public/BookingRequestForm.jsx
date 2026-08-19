import React, { useState } from 'react';
import { submitClassSignup } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';
import { friendlySignupError } from '@/lib/classSignup';

function FieldLabel({ children, required = false, htmlFor = undefined }) {
  const Component = htmlFor ? 'label' : 'span';
  return (
    <Component htmlFor={htmlFor} className="block font-body text-xs text-xert-concrete/60 uppercase tracking-wider mb-2">
      {children}{required && <span className="text-xert-red ml-1" aria-hidden="true">*</span>}
    </Component>
  );
}
function Input({ ...props }) {
  return (
    <input {...props}
      className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red transition-colors" />
  );
}

const TRAINING_LEVELS = ['New / beginner', 'Some gym experience', 'Regular trainer', 'Advanced'];

export default function BookingRequestForm({
  session,
  onSuccess,
  onCancel,
  submitLabel = 'Request spot',
  busyLabel = 'Requesting...',
  consentLabel = 'I consent to XERT contacting me about this booking request.',
  takesSpot = false,
}) {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', training_level: '',
    notes: '', consent_to_contact: false, company_website: '',
    class_session_id: session?.id || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { setError('Valid email is required.'); return; }
    if (!form.phone.trim()) { setError('Phone is required.'); return; }
    if (!form.consent_to_contact) { setError('Consent to contact is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await submitClassSignup(form);
      onSuccess?.(result);
    } catch (submitError) {
      setError(friendlySignupError(submitError));
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

      {session && (
        <div className="bg-xert-charcoal p-3 border-l-2 border-xert-red mb-6">
          <p className="font-display text-sm text-xert-offwhite uppercase">{session.title}</p>
          <p className="font-body text-xs text-xert-concrete/60 mt-1">
            {session.start_time ? new Date(session.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            {session.coach_name ? ` · ${session.coach_name}` : ''}
          </p>
        </div>
      )}

      <div><FieldLabel htmlFor="booking-full-name" required>Full name</FieldLabel><Input id="booking-full-name" name="full_name" autoComplete="name" aria-required="true" placeholder="Your name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
      <div><FieldLabel htmlFor="booking-email" required>Email</FieldLabel><Input id="booking-email" name="email" autoComplete="email" aria-required="true" type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
      <div><FieldLabel htmlFor="booking-phone" required>Phone</FieldLabel><Input id="booking-phone" name="phone" autoComplete="tel" aria-required="true" type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>

      <fieldset>
        <legend className="block font-body text-xs text-xert-concrete/60 uppercase tracking-wider mb-2">Training level</legend>
        <div className="flex flex-wrap gap-2">
          {TRAINING_LEVELS.map(l => (
            <button type="button" key={l}
              onClick={() => set('training_level', l)}
              aria-pressed={form.training_level === l}
              className={`min-h-11 px-3 py-2 text-sm font-body border transition-all ${form.training_level === l ? 'border-xert-red bg-xert-steel/10 text-xert-red' : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'}`}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <FieldLabel htmlFor="booking-notes">Notes</FieldLabel>
        <textarea id="booking-notes" name="notes" value={form.notes} onChange={e => set('notes', e.target.value)}
          rows={2} placeholder="Any questions or information for the coach (optional)"
          className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
      </div>

      {takesSpot && (
        <p className="font-body text-xs text-xert-pale/70">
          Your spot is held as soon as you submit these details.
        </p>
      )}

      <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
        {consentLabel}
      </FormCheckbox>

      {error && (
        <div role="alert" className="p-3 border border-xert-red/50 bg-xert-steel/10">
          <p className="font-body text-sm text-xert-red">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading}
          className="xert-btn-primary flex-1 py-3 font-display text-sm uppercase disabled:opacity-50">
          {loading ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
