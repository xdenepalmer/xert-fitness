import React, { useState } from 'react';
import { requestClassBooking } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';

function FieldLabel({ children, required = false }) {
  return (
    <label className="block font-body text-xs text-xert-concrete/60 uppercase tracking-wider mb-2">
      {children}{required && <span className="text-xert-red ml-1">*</span>}
    </label>
  );
}
function Input({ ...props }) {
  return (
    <input {...props}
      className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red transition-colors" />
  );
}

const TRAINING_LEVELS = ['New / beginner', 'Some gym experience', 'Regular trainer', 'Advanced'];

export default function BookingRequestForm({ session, onSuccess, onCancel }) {
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
      await requestClassBooking(form);
      onSuccess?.();
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="text" name="company_website" value={form.company_website}
        onChange={e => set('company_website', e.target.value)}
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

      <div><FieldLabel required>Full name</FieldLabel><Input placeholder="Your name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
      <div><FieldLabel required>Email</FieldLabel><Input type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
      <div><FieldLabel required>Phone</FieldLabel><Input type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>

      <div>
        <FieldLabel>Training level</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {TRAINING_LEVELS.map(l => (
            <button type="button" key={l}
              onClick={() => set('training_level', l)}
              aria-pressed={form.training_level === l}
              className={`px-3 py-2 text-sm font-body border transition-all ${form.training_level === l ? 'border-xert-red bg-xert-red/10 text-xert-red' : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Notes</FieldLabel>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          rows={2} placeholder="Any questions or information for the coach (optional)"
          className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
      </div>

      <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
        I consent to XERT contacting me about this booking request.
      </FormCheckbox>

      {error && (
        <div className="p-3 border border-xert-red/50 bg-xert-red/10">
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
          className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
          {loading ? 'Requesting...' : 'Request spot'}
        </button>
      </div>
    </form>
  );
}
