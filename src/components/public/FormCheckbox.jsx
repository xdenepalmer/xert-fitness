import React from 'react';
import { Check } from 'lucide-react';

export default function FormCheckbox({ checked, onChange, children, required = false, name }) {
  return (
    <label className="flex min-h-11 items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        required={required}
        className="peer absolute w-px h-px opacity-0"
      />
      <span
        aria-hidden="true"
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-xert-steel peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-xert-navy ${checked ? 'border-xert-steel bg-xert-steel' : 'border-xert-steel/45 bg-white/[0.03] group-hover:border-xert-steel/80'}`}
      >
        {checked && <Check className="w-3.5 h-3.5 text-xert-navy" strokeWidth={3} />}
      </span>
      <span className="font-body text-sm leading-relaxed text-xert-pale/85">
        {children}{required && <span className="text-xert-steel ml-1" aria-hidden="true">*</span>}
      </span>
    </label>
  );
}
