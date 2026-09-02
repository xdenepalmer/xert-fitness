import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitMemberInterest } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';

const STEPS = ['About you', 'Training', 'Interests', 'Confirm'];

const AGE_RANGES = ['16–20', '21–30', '31–40', '41–55', '56+'];
const TRAINING_LEVELS = ['New / beginner', 'Some gym experience', 'Regular trainer', 'Advanced', 'Returning after time off'];
const OCCUPATION_GROUPS = ['Emergency services', 'Mine worker', 'Hospital / healthcare', 'Teacher / education', 'Council / government', 'Trade / labour', 'Office / admin', 'Student', 'Local business owner', 'Other'];
const TRAINING_GOALS = ['Strength', 'Conditioning', 'Weight loss / body composition', 'Confidence', 'Event preparation', 'Sport performance', 'General health', 'Community / accountability', 'PT support'];
const PREFERRED_TIMES = ['Early morning', 'Mid-morning', 'Lunch', 'Afternoon', 'After work', 'Evening', 'Weekends'];

const chipClasses = 'min-h-11 px-3 py-2 text-sm font-body rounded-full border transition-colors';
const chipActive = 'border-xert-steel bg-xert-steel text-xert-navy';
const chipIdle = 'border-xert-steel/30 bg-white/[0.03] text-xert-pale/75 hover:border-xert-steel';
const errorStyle = { color: '#f0a1a1', borderColor: 'rgba(240,161,161,0.35)', backgroundColor: 'rgba(240,161,161,0.08)' };
const backButtonClasses = 'xert-btn-ghost inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-5 font-display text-sm uppercase tracking-wide';
const nextButtonClasses = 'xert-btn-primary inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-8 font-display text-base uppercase tracking-wide';

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
          aria-pressed={value.includes(opt)}
          className={`${chipClasses} ${value.includes(opt) ? chipActive : chipIdle}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function FieldLabel({ children, required = false, htmlFor = undefined, as = undefined }) {
  const Component = as || (htmlFor ? 'label' : 'span');
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
      <input type="text" name="company_website" value={form.company_website} autoComplete="off"
        onChange={e => set('company_website', e.target.value)}
        className="absolute opacity-0 h-0 w-0 pointer-events-none" tabIndex={-1} aria-hidden="true" />

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-1.5 ${i <= step ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-display ${i < step ? 'bg-xert-steel text-xert-navy' : i === step ? 'border-2 border-xert-steel text-xert-steel' : 'border border-xert-steel/50 text-xert-steel'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className="hidden sm:block font-body text-xs text-xert-pale/65">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-xert-steel' : 'bg-xert-steel/25'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 0: About you */}
      {step === 0 && (
        <div className="space-y-5">
          <div><FieldLabel htmlFor="member-full-name" required>Full name</FieldLabel><Input id="member-full-name" name="full_name" required autoComplete="name" placeholder="Your full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div><FieldLabel htmlFor="member-email" required>Email</FieldLabel><Input id="member-email" name="email" required autoComplete="email" type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><FieldLabel htmlFor="member-phone" required>Phone</FieldLabel><Input id="member-phone" name="phone" required autoComplete="tel" type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <fieldset>
            <FieldLabel as="legend" required>Age range</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {AGE_RANGES.map(a => (
                <button type="button" key={a}
                  onClick={() => set('age_range', a)}
                  aria-pressed={form.age_range === a}
                  className={`min-h-11 px-4 py-2 font-body text-sm rounded-full border transition-colors ${form.age_range === a ? chipActive : chipIdle}`}>
                  {a}
                </button>
              ))}
            </div>
          </fieldset>
          <div><FieldLabel htmlFor="member-suburb" required>Suburb / town</FieldLabel><Input id="member-suburb" name="suburb_town" required autoComplete="address-level2" placeholder="e.g. Kingaroy" value={form.suburb_town} onChange={e => set('suburb_town', e.target.value)} /></div>
          <div>
            <FieldLabel htmlFor="member-occupation">Occupation group</FieldLabel>
            <select id="member-occupation" name="occupation_group" value={form.occupation_group} onChange={e => set('occupation_group', e.target.value)}
              className="xert-input">
              <option value="">Select (optional)</option>
              {OCCUPATION_GROUPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Step 1: Training */}
      {step === 1 && (
        <div className="space-y-6">
          <fieldset>
            <FieldLabel as="legend" required>Current training level</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TRAINING_LEVELS.map(l => (
                <button type="button" key={l}
                  onClick={() => set('current_training_level', l)}
                  aria-pressed={form.current_training_level === l}
                  className={`${chipClasses} ${form.current_training_level === l ? chipActive : chipIdle}`}>
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <FieldLabel as="legend" required>Main training goals (select all that apply)</FieldLabel>
            <MultiSelect options={TRAINING_GOALS} value={form.main_training_goals} onChange={v => set('main_training_goals', v)} />
          </fieldset>
          <fieldset>
            <FieldLabel as="legend" required>Preferred training times (select all that apply)</FieldLabel>
            <MultiSelect options={PREFERRED_TIMES} value={form.preferred_training_times} onChange={v => set('preferred_training_times', v)} />
          </fieldset>
        </div>
      )}

      {/* Step 2: Interests */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="font-body text-xs text-xert-pale/55 mb-4">All optional — helps us plan capacity and services.</p>
          {[
            { key: 'interested_in_group_classes', label: 'Interested in group classes' },
            { key: 'interested_in_pt', label: 'Interested in personal training' },
            { key: 'interested_in_workshops', label: 'Interested in workshops' },
            { key: 'interested_in_event_prep', label: 'Interested in event preparation' },
          ].map(item => (
            <FormCheckbox key={item.key} name={item.key} checked={form[item.key]} onChange={checked => set(item.key, checked)}>
              {item.label}
            </FormCheckbox>
          ))}
          <div>
            <FieldLabel htmlFor="member-limitations">Any injuries or physical limitations</FieldLabel>
            <textarea id="member-limitations" name="injuries_or_limitations_optional" value={form.injuries_or_limitations_optional}
              onChange={e => set('injuries_or_limitations_optional', e.target.value)}
              rows={2} placeholder="Optional — helps us coach you appropriately"
              className="xert-input resize-none" />
          </div>
          <div>
            <FieldLabel htmlFor="member-reason">What's the biggest reason you're joining?</FieldLabel>
            <textarea id="member-reason" name="biggest_reason_for_joining" value={form.biggest_reason_for_joining}
              onChange={e => set('biggest_reason_for_joining', e.target.value)}
              rows={2} placeholder="Optional — helps us understand what matters to you"
              className="xert-input resize-none" />
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="xert-card-flat p-4 space-y-1">
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Name:</strong> {form.full_name}</p>
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Email:</strong> {form.email}</p>
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Goals:</strong> {form.main_training_goals.join(', ') || '—'}</p>
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Times:</strong> {form.preferred_training_times.join(', ') || '—'}</p>
          </div>

          <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
            I consent to XERT Fitness contacting me about my interest and the soft launch.
          </FormCheckbox>
          <p className="font-body text-xs pl-8 text-xert-pale/55">
            See how XERT handles your details in the <a href="/privacy" className="underline text-xert-steel">Privacy Policy</a>.
          </p>

          <FormCheckbox name="mailing_list_consent" checked={form.mailing_list_consent} onChange={checked => set('mailing_list_consent', checked)}>
            I'd like to receive XERT updates and launch information by email. (Optional)
          </FormCheckbox>
        </div>
      )}

      {/* Error */}
      <div role="alert" aria-live="assertive">
        {error && (
          <div className="mt-4 rounded-xl border p-3" style={errorStyle}>
            <p className="font-body text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-3 mt-8 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <button type="button" onClick={back} className={backButtonClasses}>
            Back
          </button>
        ) : <div />}

        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={nextButtonClasses}>
            Continue
          </button>
        ) : (
          <button type="submit" disabled={loading} className={`${nextButtonClasses} disabled:opacity-50`}>
            {loading ? 'Submitting...' : 'Register interest'}
          </button>
        )}
      </div>
    </form>
  );
}
