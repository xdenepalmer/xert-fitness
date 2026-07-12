import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitMemberInterest } from '@/lib/submitForms';

const STEPS = ['About you', 'Training', 'Interests', 'Confirm'];

const AGE_RANGES = ['16–20', '21–30', '31–40', '41–55', '56+'];
const TRAINING_LEVELS = ['New / beginner', 'Some gym experience', 'Regular trainer', 'Advanced', 'Returning after time off'];
const OCCUPATION_GROUPS = ['Emergency services', 'Mine worker', 'Hospital / healthcare', 'Teacher / education', 'Council / government', 'Trade / labour', 'Office / admin', 'Student', 'Local business owner', 'Other'];
const TRAINING_GOALS = ['Strength', 'Conditioning', 'Weight loss / body composition', 'Confidence', 'Event preparation', 'Sport performance', 'General health', 'Community / accountability', 'PT support'];
const PREFERRED_TIMES = ['Early morning', 'Mid-morning', 'Lunch', 'Afternoon', 'After work', 'Evening', 'Weekends'];

function MultiSelect({ options, value = [], onChange }) {
  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button type="button" key={opt}
          onClick={() => toggle(opt)}
          className={`px-3 py-2 text-sm font-body border transition-all ${value.includes(opt)
            ? 'border-xert-red bg-xert-red/10 text-xert-red'
            : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

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

export default function MemberInterestForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', age_range: '', suburb_town: '',
    current_training_level: '', main_training_goals: [], preferred_training_times: [],
    occupation_group: '', interested_in_group_classes: false, interested_in_pt: false,
    interested_in_workshops: false, interested_in_event_prep: false,
    injuries_or_limitations_optional: '', biggest_reason_for_joining: '',
    consent_to_contact: false, mailing_list_consent: false,
    company_website: '', // honeypot
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.full_name.trim()) return 'Full name is required.';
      if (!form.email.trim() || !form.email.includes('@')) return 'Valid email is required.';
      if (!form.phone.trim()) return 'Phone is required.';
      if (!form.age_range) return 'Age range is required.';
      if (!form.suburb_town.trim()) return 'Suburb/town is required.';
    }
    if (step === 1) {
      if (!form.current_training_level) return 'Training level is required.';
      if (form.main_training_goals.length === 0) return 'Select at least one training goal.';
      if (form.preferred_training_times.length === 0) return 'Select at least one preferred time.';
    }
    if (step === 3) {
      if (!form.consent_to_contact) return 'Consent to contact is required.';
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  };

  const back = () => { setError(''); setStep(s => s - 1); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateStep();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    try {
      await submitMemberInterest(form);
      navigate('/thank-you');
    } catch (e) {
      setError('Submission failed. Please try again or contact us directly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off">
      {/* Honeypot */}
      <input type="text" name="company_website" value={form.company_website}
        onChange={e => set('company_website', e.target.value)}
        className="absolute opacity-0 h-0 w-0 pointer-events-none" tabIndex={-1} aria-hidden="true" />

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-1.5 ${i <= step ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-display ${i < step ? 'bg-xert-red text-white' : i === step ? 'border-2 border-xert-red text-xert-red' : 'border border-xert-steel/50 text-xert-steel'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className="hidden sm:block font-body text-xs text-xert-concrete/60">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-xert-red' : 'bg-xert-steel/30'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 0: About you */}
      {step === 0 && (
        <div className="space-y-5">
          <div><FieldLabel required>Full name</FieldLabel><Input placeholder="Your full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div><FieldLabel required>Email</FieldLabel><Input type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><FieldLabel required>Phone</FieldLabel><Input type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div>
            <FieldLabel required>Age range</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {AGE_RANGES.map(a => (
                <button type="button" key={a}
                  onClick={() => set('age_range', a)}
                  className={`px-4 py-2 font-body text-sm border transition-all ${form.age_range === a ? 'border-xert-red bg-xert-red/10 text-xert-red' : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div><FieldLabel required>Suburb / town</FieldLabel><Input placeholder="e.g. Kingaroy" value={form.suburb_town} onChange={e => set('suburb_town', e.target.value)} /></div>
          <div>
            <FieldLabel>Occupation group</FieldLabel>
            <select value={form.occupation_group} onChange={e => set('occupation_group', e.target.value)}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite focus:outline-none focus:border-xert-red">
              <option value="">Select (optional)</option>
              {OCCUPATION_GROUPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Step 1: Training */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <FieldLabel required>Current training level</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TRAINING_LEVELS.map(l => (
                <button type="button" key={l}
                  onClick={() => set('current_training_level', l)}
                  className={`px-3 py-2 text-sm font-body border transition-all ${form.current_training_level === l ? 'border-xert-red bg-xert-red/10 text-xert-red' : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel required>Main training goals (select all that apply)</FieldLabel>
            <MultiSelect options={TRAINING_GOALS} value={form.main_training_goals} onChange={v => set('main_training_goals', v)} />
          </div>
          <div>
            <FieldLabel required>Preferred training times (select all that apply)</FieldLabel>
            <MultiSelect options={PREFERRED_TIMES} value={form.preferred_training_times} onChange={v => set('preferred_training_times', v)} />
          </div>
        </div>
      )}

      {/* Step 2: Interests */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="font-body text-xs text-xert-concrete/50 mb-4">All optional — helps us plan capacity and services.</p>
          {[
            { key: 'interested_in_group_classes', label: 'Interested in group classes' },
            { key: 'interested_in_pt', label: 'Interested in personal training' },
            { key: 'interested_in_workshops', label: 'Interested in workshops' },
            { key: 'interested_in_event_prep', label: 'Interested in event preparation' },
          ].map(item => (
            <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
              <div onClick={() => set(item.key, !form[item.key])}
                className={`w-5 h-5 border-2 flex items-center justify-center shrink-0 transition-all ${form[item.key] ? 'border-xert-red bg-xert-red' : 'border-xert-steel/50 group-hover:border-xert-red/50'}`}>
                {form[item.key] && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="font-body text-sm text-xert-concrete/80">{item.label}</span>
            </label>
          ))}
          <div>
            <FieldLabel>Any injuries or physical limitations</FieldLabel>
            <textarea value={form.injuries_or_limitations_optional}
              onChange={e => set('injuries_or_limitations_optional', e.target.value)}
              rows={2} placeholder="Optional — helps us coach you appropriately"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
          </div>
          <div>
            <FieldLabel>What's the biggest reason you're joining?</FieldLabel>
            <textarea value={form.biggest_reason_for_joining}
              onChange={e => set('biggest_reason_for_joining', e.target.value)}
              rows={2} placeholder="Optional — helps us understand what matters to you"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-xert-charcoal p-4 border-l-2 border-xert-red space-y-1">
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Name:</strong> {form.full_name}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Email:</strong> {form.email}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Goals:</strong> {form.main_training_goals.join(', ') || '—'}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Times:</strong> {form.preferred_training_times.join(', ') || '—'}</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div onClick={() => set('consent_to_contact', !form.consent_to_contact)}
              className={`w-5 h-5 border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${form.consent_to_contact ? 'border-xert-red bg-xert-red' : 'border-xert-steel/50 group-hover:border-xert-red/50'}`}>
              {form.consent_to_contact && <span className="text-white text-xs">✓</span>}
            </div>
            <span className="font-body text-sm text-xert-concrete/80">
              I consent to XERT Fitness contacting me about my interest and the soft launch as described in the <a href="/privacy" className="underline text-xert-steel">Privacy Policy</a>. <span className="text-xert-red">*</span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div onClick={() => set('mailing_list_consent', !form.mailing_list_consent)}
              className={`w-5 h-5 border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${form.mailing_list_consent ? 'border-xert-red bg-xert-red' : 'border-xert-steel/50 group-hover:border-xert-red/50'}`}>
              {form.mailing_list_consent && <span className="text-white text-xs">✓</span>}
            </div>
            <span className="font-body text-sm text-xert-concrete/80">
              I'd like to receive XERT updates and launch information by email. (Optional)
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 border border-xert-red/50 bg-xert-red/10">
          <p className="font-body text-sm text-xert-red">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        {step > 0 ? (
          <button type="button" onClick={back}
            className="px-5 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">
            Back
          </button>
        ) : <div />}

        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next}
            className="px-8 py-3 bg-xert-red text-white font-display text-base uppercase hover:bg-xert-orange transition-colors">
            Continue
          </button>
        ) : (
          <button type="submit" disabled={loading}
            className="px-8 py-3 bg-xert-red text-white font-display text-base uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {loading ? 'Submitting...' : 'Register interest'}
          </button>
        )}
      </div>
    </form>
  );
}
