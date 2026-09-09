import React, {Children, cloneElement, useId, useState} from 'react';

export const ADMIN_STATUS_TONES = Object.freeze({
  active:'success', confirmed:'success', completed:'success', approved:'success',
  pending:'warning', waiting:'warning', new:'info', contacted:'info',
  cancelled:'danger', rejected:'danger', error:'danger', inactive:'neutral', archived:'neutral',
});

export function AdminBadge({status, children = null, className = ''}) {
  const tone = ADMIN_STATUS_TONES[String(status).toLowerCase()] || 'neutral';
  return <span className={`admin-badge ${className}`} data-tone={tone}>{children ?? status ?? 'Unknown'}</span>;
}

export function AdminStatCard({label, value, detail = null, status = null, children = null}) {
  return <article className="admin-stat-card"><p className="admin-kit-label">{label}</p><p className="admin-stat-value">{value}</p>{detail && <p>{detail}</p>}{status && <AdminBadge status={status} />}{children}</article>;
}

export function AdminEmptyState({title, description, action = null, children = null}) {
  return <div className="admin-empty-state"><h3>{title}</h3>{description && <p>{description}</p>}{children}{action && <div className="admin-empty-action">{action}</div>}</div>;
}

/** Geometry matches WorkspaceSkeleton; decorative fragments avoid repeated announcements. */
export function AdminSkeleton({variant = 'line', size = 'long', label = 'Loading content', decorative = false, className = ''}) {
  return <span role={decorative ? undefined : 'status'} aria-label={decorative ? undefined : label} aria-hidden={decorative ? true : undefined} className={`admin-kit-skeleton admin-skeleton-${variant} ${className}`} data-size={size} />;
}

export function AdminFormField({id = undefined, label, helper = null, error = null, required = undefined, children}) {
  const generatedId = useId();
  const child = Children.only(children);
  const inputId = id || child.props.id || generatedId;
  const describedBy = [child.props['aria-describedby'], helper && `${inputId}-helper`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="admin-form-field">
    <label className="admin-kit-label" htmlFor={inputId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {cloneElement(child, {id:inputId, required:required ?? child.props.required,
      'aria-describedby':describedBy, 'aria-invalid':error ? true : child.props['aria-invalid'],
      className:`admin-kit-input ${child.props.className || ''}`})}
    {helper && <p id={`${inputId}-helper`} className="admin-field-helper">{helper}</p>}
    {error && <p id={`${inputId}-error`} className="admin-field-error">{error}</p>}
  </div>;
}

/** Undefined value is uncontrolled; every other value (including '') is controlled. */
export function AdminSegmented({label, options, value = undefined, defaultValue = undefined, onValueChange = undefined}) {
  const [localValue, setLocalValue] = useState(defaultValue ?? options.find(option => !option.disabled)?.value);
  const current = value === undefined ? localValue : value;
  const enabled = options.filter(option => !option.disabled);
  const tabValue = enabled.some(option => option.value === current) ? current : enabled[0]?.value;
  const select = next => { if (value === undefined) setLocalValue(next); onValueChange?.(next); };
  function onKeyDown(event, option) {
    const index = enabled.findIndex(item => item.value === option.value);
    let next;
    if (['ArrowRight','ArrowDown'].includes(event.key)) next = enabled[(index+1)%enabled.length];
    else if (['ArrowLeft','ArrowUp'].includes(event.key)) next = enabled[(index-1+enabled.length)%enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled.at(-1);
    if (!next) return;
    event.preventDefault();
    select(next.value);
    const radios = event.currentTarget.parentElement.querySelectorAll('[role="radio"]');
    radios[options.findIndex(item => item.value === next.value)]?.focus();
  }
  return <div className="admin-segmented" role="radiogroup" aria-label={label}>{options.map(option => <button key={option.value} type="button" role="radio" aria-checked={current === option.value} tabIndex={tabValue === option.value ? 0 : -1} disabled={option.disabled} onClick={() => select(option.value)} onKeyDown={event => onKeyDown(event, option)}>{option.label}</button>)}</div>;
}

export function AdminTimeline({items, label = 'Activity timeline'}) {
  return <ol className="admin-timeline" aria-label={label}>{items.map(item => <li key={item.id}>
    <h3>{item.title}</h3><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString(undefined, {dateStyle:'medium',timeStyle:'short'})}</time>
    {item.detail && <p>{item.detail}</p>}{item.metadata && <div className="admin-timeline-metadata">{item.metadata}</div>}
  </li>)}</ol>;
}
