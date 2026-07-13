import React from 'react';
import { Check } from 'lucide-react';

export default function FormCheckbox({ checked, onChange, children, required = false, name }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
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
        className={`w-5 h-5 border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-xert-steel peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-xert-charcoal ${checked ? 'border-xert-red bg-xert-steel' : 'border-xert-steel/50 group-hover:border-xert-red/60'}`}
      >
        {checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="font-body text-sm text-xert-concrete/80">
        {children}{required && <span className="text-xert-red ml-1" aria-hidden="true">*</span>}
      </span>
    </label>
  );
}
