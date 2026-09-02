import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitPartnerInterest } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';

const STEPS = ['Contact', 'Practice', 'Confirm'];
const SERVICES = ['Physiotherapy', 'Nutrition / dietetics', 'Psychology / mental performance', 'Massage therapy', 'Strength & conditioning education', 'Medical / GP', 'Podiatry', 'Occupational therapy', 'Other allied health'];

const chipClasses = 'min-h-11 px-3 py-2 text-sm font-body rounded-full border transition-colors';
const chipActive = 'border-xert-steel bg-xert-steel text-xert-navy';
const chipIdle = 'border-xert-steel/30 bg-white/[0.03] text-xert-pale/75 hover:border-xert-steel';
const errorStyle = { color: '#f0a1a1', borderColor: 'rgba(240,161,161,0.35)', backgroundColor: 'rgba(240,161,161,0.08)' };
const backButtonClasses = 'xert-btn-ghost inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-5 font-display text-sm uppercase tracking-wide';
const nextButtonClasses = 'xert-btn-primary inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-8 font-display text-base uppercase tracking-wide';

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

export default function PartnerInterestForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '', business_name: '', email: '', phone: '',
    profession: '', services_offered: [],
    availability: '', subcontract_interest: false, workshop_interest: false,
    preferred_model: '', website_social_link: '', short_intro: '',
    consent_to_contact: false, company_website: '',
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.full_name.trim()) return 'Full name is required.';
      if (!form.email.trim() || !form.email.includes('@')) return 'Valid email is required.';
      if (!form.phone.trim()) return 'Phone is required.';
      if (!form.business_name.trim()) return 'Business name is required.';
    }
    if (step === 1) {
      if (!form.profession.trim()) return 'Profession is required.';
      if (form.services_offered.length === 0) return 'Select at least one service.';
    }
    if (step === 2 && !form.consent_to_contact) return 'Consent to contact is required.';
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
      await submitPartnerInterest(form);
      navigate('/thank-you');
    } catch (e) {
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off">
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

      {step === 0 && (
        <div className="space-y-5">
          <div><FieldLabel htmlFor="partner-full-name" required>Full name</FieldLabel><Input id="partner-full-name" name="full_name" autoComplete="name" placeholder="Your full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div><FieldLabel htmlFor="partner-business-name" required>Business / practice name</FieldLabel><Input id="partner-business-name" name="business_name" autoComplete="organization" placeholder="Business name" value={form.business_name} onChange={e => set('business_name', e.target.value)} /></div>
          <div><FieldLabel htmlFor="partner-email" required>Email</FieldLabel><Input id="partner-email" name="email" autoComplete="email" type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><FieldLabel htmlFor="partner-phone" required>Phone</FieldLabel><Input id="partner-phone" name="phone" autoComplete="tel" type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <FieldLabel htmlFor="partner-profession" required>Profession / specialty</FieldLabel>
            <Input id="partner-profession" name="profession" placeholder="e.g. Physiotherapist, Nutritionist" value={form.profession} onChange={e => set('profession', e.target.value)} />
          </div>
          <fieldset>
            <FieldLabel as="legend" required>Services offered</FieldLabel>
            <MultiSelect options={SERVICES} value={form.services_offered} onChange={v => set('services_offered', v)} />
          </fieldset>
          <div className="space-y-3">
            {[
              { key: 'subcontract_interest', label: 'Open to subcontracting at XERT' },
              { key: 'workshop_interest', label: 'Interested in running workshops' },
            ].map(item => (
              <FormCheckbox key={item.key} name={item.key} checked={form[item.key]} onChange={checked => set(item.key, checked)}>
                {item.label}
              </FormCheckbox>
            ))}
          </div>
          <div>
            <FieldLabel htmlFor="partner-preferred-model">Preferred partnership model</FieldLabel>
            <select id="partner-preferred-model" name="preferred_model" value={form.preferred_model} onChange={e => set('preferred_model', e.target.value)}
              className="xert-input">
              <option value="">Select (optional)</option>
              {['Referral partner', 'Regular sessions at XERT', 'Workshops only', 'Online services', 'Flexible / open to discussion'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="partner-availability">Availability</FieldLabel>
            <Input id="partner-availability" name="availability" placeholder="e.g. Evenings and weekends" value={form.availability} onChange={e => set('availability', e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="partner-website-social">Website or social link</FieldLabel>
            <Input id="partner-website-social" name="website_social_link" placeholder="Optional" value={form.website_social_link} onChange={e => set('website_social_link', e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="partner-short-intro">Short intro</FieldLabel>
            <textarea id="partner-short-intro" name="short_intro" value={form.short_intro} onChange={e => set('short_intro', e.target.value)}
              rows={3} placeholder="Tell us about your practice and what you'd bring to XERT"
              className="xert-input resize-none" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="xert-card-flat p-4 space-y-1">
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Name:</strong> {form.full_name}</p>
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Business:</strong> {form.business_name}</p>
            <p className="font-body text-sm text-xert-pale/80"><strong className="text-xert-offwhite">Services:</strong> {form.services_offered.join(', ') || '—'}</p>
          </div>
          <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
            I consent to XERT Fitness contacting me about this enquiry.
          </FormCheckbox>
        </div>
      )}

      <div role="alert" aria-live="assertive">
        {error && (
          <div className="mt-4 rounded-xl border p-3" style={errorStyle}>
            <p className="font-body text-sm">{error}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 mt-8 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <button type="button" onClick={() => { setError(''); setStep(s => s - 1); }} className={backButtonClasses}>
            Back
          </button>
        ) : <div />}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={nextButtonClasses}>
            Continue
          </button>
        ) : (
          <button type="submit" disabled={loading} className={`${nextButtonClasses} disabled:opacity-50`}>
            {loading ? 'Submitting...' : 'Submit enquiry'}
          </button>
        )}
      </div>
    </form>
  );
}
