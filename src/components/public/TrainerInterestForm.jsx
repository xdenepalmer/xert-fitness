import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitTrainerInterest } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';

const STEPS = ['Contact', 'Experience', 'Details', 'Confirm'];
const SPECIALTIES = ['Strength & conditioning', 'Endurance', 'Olympic lifting', 'Gymnastics', 'Nutrition', 'Rehabilitation', 'Youth training', 'Sport specific', 'Group fitness', 'Mindset / mental performance'];
const AVAILABILITY = ['Early morning', 'Mid-morning', 'Lunch', 'Afternoon', 'After work', 'Evening', 'Weekends', 'Flexible'];

function FieldLabel({ children, required = false }) {
  return (
    <label className="block font-body text-xs text-xert-concrete/60 uppercase tracking-wider mb-2">
      {children}{required && <span className="text-xert-red ml-1">*</span>}
    </label>
  );
}

function Input({ ...props }) {
  return (
    <input aria-label={props['aria-label'] || props.placeholder} {...props}
      className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red transition-colors" />
  );
}

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
          className={`px-3 py-2 text-sm font-body border transition-all ${value.includes(opt)
            ? 'border-xert-red bg-xert-red/10 text-xert-red'
            : 'border-xert-steel/40 text-xert-concrete/70 hover:border-xert-steel'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function TrainerInterestForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    qualifications: '', years_experience: '', functional_training_experience: '',
    availability: [], specialties: [], interested_in_group_classes: false,
    interested_in_pt: false, interested_in_workshops: false,
    first_aid_cpr: false, insurance_status: '', short_intro: '', social_links: '',
    consent_to_contact: false, company_website: '',
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.full_name.trim()) return 'Full name is required.';
      if (!form.email.trim() || !form.email.includes('@')) return 'Valid email is required.';
      if (!form.phone.trim()) return 'Phone is required.';
    }
    if (step === 1) {
      if (!form.qualifications.trim()) return 'Qualifications are required.';
      if (!form.years_experience) return 'Years of experience is required.';
      if (!form.functional_training_experience.trim()) return 'Functional training experience is required.';
      if (form.availability.length === 0) return 'Select at least one availability option.';
    }
    if (step === 3 && !form.consent_to_contact) return 'Consent to contact is required.';
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateStep();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    try {
      await submitTrainerInterest(form);
      navigate('/thank-you');
    } catch (e) {
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
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

      {step === 0 && (
        <div className="space-y-5">
          <div><FieldLabel required>Full name</FieldLabel><Input placeholder="Your full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div><FieldLabel required>Email</FieldLabel><Input type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><FieldLabel required>Phone</FieldLabel><Input type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <FieldLabel required>Qualifications</FieldLabel>
            <Input placeholder="e.g. Cert IV in Fitness, ASCA Level 2" value={form.qualifications} onChange={e => set('qualifications', e.target.value)} />
          </div>
          <div>
            <FieldLabel required>Years of experience</FieldLabel>
            <select aria-label="Years of experience" value={form.years_experience} onChange={e => set('years_experience', e.target.value)}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite focus:outline-none focus:border-xert-red">
              <option value="">Select</option>
              {['Under 1 year', '1–2 years', '3–5 years', '5–10 years', '10+ years'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel required>Functional training experience</FieldLabel>
            <textarea aria-label="Functional training experience" value={form.functional_training_experience} onChange={e => set('functional_training_experience', e.target.value)}
              rows={3} placeholder="Describe your experience with functional training approaches"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
          </div>
          <div>
            <FieldLabel required>Availability</FieldLabel>
            <MultiSelect options={AVAILABILITY} value={form.availability} onChange={v => set('availability', v)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <FieldLabel>Specialties</FieldLabel>
            <MultiSelect options={SPECIALTIES} value={form.specialties} onChange={v => set('specialties', v)} />
          </div>
          <div className="space-y-3">
            {[
              { key: 'interested_in_group_classes', label: 'Available for group classes' },
              { key: 'interested_in_pt', label: 'Available for personal training' },
              { key: 'interested_in_workshops', label: 'Available for workshops' },
              { key: 'first_aid_cpr', label: 'Current First Aid / CPR certification' },
            ].map(item => (
              <FormCheckbox key={item.key} name={item.key} checked={form[item.key]} onChange={checked => set(item.key, checked)}>
                {item.label}
              </FormCheckbox>
            ))}
          </div>
          <div>
            <FieldLabel>Insurance status</FieldLabel>
            <select aria-label="Insurance status" value={form.insurance_status} onChange={e => set('insurance_status', e.target.value)}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite focus:outline-none focus:border-xert-red">
              <option value="">Select (optional)</option>
              {['Current PI/PL insurance', 'Expired — can renew', 'Not currently insured', 'Unsure'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Short intro</FieldLabel>
            <textarea aria-label="Short introduction" value={form.short_intro} onChange={e => set('short_intro', e.target.value)}
              rows={3} placeholder="Tell us a bit about yourself and your coaching approach"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
          </div>
          <div>
            <FieldLabel>Social / website links</FieldLabel>
            <Input placeholder="Instagram, LinkedIn or website URL (optional)" value={form.social_links} onChange={e => set('social_links', e.target.value)} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-xert-charcoal p-4 border-l-2 border-xert-red space-y-1">
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Name:</strong> {form.full_name}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Email:</strong> {form.email}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Experience:</strong> {form.years_experience}</p>
          </div>
          <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
            I consent to XERT Fitness contacting me about this application.
          </FormCheckbox>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 border border-xert-red/50 bg-xert-red/10">
          <p className="font-body text-sm text-xert-red">{error}</p>
        </div>
      )}

      <div className="flex justify-between mt-8">
        {step > 0 ? (
          <button type="button" onClick={() => { setError(''); setStep(s => s - 1); }}
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
            {loading ? 'Submitting...' : 'Submit application'}
          </button>
        )}
      </div>
    </form>
  );
}
