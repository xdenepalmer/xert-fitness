import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitPartnerInterest } from '@/lib/submitForms';
import FormCheckbox from '@/components/public/FormCheckbox';

const STEPS = ['Contact', 'Practice', 'Confirm'];
const SERVICES = ['Physiotherapy', 'Nutrition / dietetics', 'Psychology / mental performance', 'Massage therapy', 'Strength & conditioning education', 'Medical / GP', 'Podiatry', 'Occupational therapy', 'Other allied health'];

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
          <div><FieldLabel required>Business / practice name</FieldLabel><Input placeholder="Business name" value={form.business_name} onChange={e => set('business_name', e.target.value)} /></div>
          <div><FieldLabel required>Email</FieldLabel><Input type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><FieldLabel required>Phone</FieldLabel><Input type="tel" placeholder="Mobile number" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <FieldLabel required>Profession / specialty</FieldLabel>
            <Input placeholder="e.g. Physiotherapist, Nutritionist" value={form.profession} onChange={e => set('profession', e.target.value)} />
          </div>
          <div>
            <FieldLabel required>Services offered</FieldLabel>
            <MultiSelect options={SERVICES} value={form.services_offered} onChange={v => set('services_offered', v)} />
          </div>
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
            <FieldLabel>Preferred partnership model</FieldLabel>
            <select value={form.preferred_model} onChange={e => set('preferred_model', e.target.value)}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-base text-xert-offwhite focus:outline-none focus:border-xert-red">
              <option value="">Select (optional)</option>
              {['Referral partner', 'Regular sessions at XERT', 'Workshops only', 'Online services', 'Flexible / open to discussion'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Availability</FieldLabel>
            <Input placeholder="e.g. Evenings and weekends" value={form.availability} onChange={e => set('availability', e.target.value)} />
          </div>
          <div>
            <FieldLabel>Website or social link</FieldLabel>
            <Input placeholder="Optional" value={form.website_social_link} onChange={e => set('website_social_link', e.target.value)} />
          </div>
          <div>
            <FieldLabel>Short intro</FieldLabel>
            <textarea value={form.short_intro} onChange={e => set('short_intro', e.target.value)}
              rows={3} placeholder="Tell us about your practice and what you'd bring to XERT"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-4 py-3 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="bg-xert-charcoal p-4 border-l-2 border-xert-red space-y-1">
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Name:</strong> {form.full_name}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Business:</strong> {form.business_name}</p>
            <p className="font-body text-sm text-xert-concrete/80"><strong className="text-xert-offwhite">Services:</strong> {form.services_offered.join(', ') || '—'}</p>
          </div>
          <FormCheckbox name="consent_to_contact" checked={form.consent_to_contact} onChange={checked => set('consent_to_contact', checked)} required>
            I consent to XERT Fitness contacting me about this enquiry.
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
            {loading ? 'Submitting...' : 'Submit enquiry'}
          </button>
        )}
      </div>
    </form>
  );
}
