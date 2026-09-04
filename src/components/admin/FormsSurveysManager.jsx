import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check, ChevronRight,
  ClipboardList, Copy, Download, ExternalLink, Eye, GitBranch, Link2,
  LoaderCircle, Pause, Pencil, Play, Plus, Search, Settings2, Trash2, X,
} from 'lucide-react';
import {
  CHARTABLE_TYPES, CHOICE_TYPES, FIELD_TYPES, FORM_TYPES, activeQuestions, archiveFormResponse,
  archiveOwnerForm, createField, createFormDraft, getFormResponse, listFormResponses, listOwnerForms,
  publicFormURL, responseCSV, saveOwnerForm, slugifyFormTitle, updateFormResponseStatus,
  validateFormDraft,
} from '@/lib/xertForms';
import AdminConfirmDialog from './AdminConfirmDialog';
import FormQRCode from './FormQRCode';
import FormResponseRecord from './FormResponseRecord';
import { respondentIdentity, respondentLabel } from '@/lib/formResponseRecord';

const panel = 'border border-xert-steel/20 bg-xert-ink';
// text-base keeps every control at 16px: anything smaller makes iOS Safari zoom
// the whole page in when the field takes focus.
const control = 'min-h-11 w-full max-w-full border border-xert-steel/25 bg-xert-deep px-3 text-base text-xert-offwhite outline-none focus:border-xert-steel focus:ring-2 focus:ring-xert-steel/15';
const shell = 'mx-auto w-full min-w-0 px-4 py-6 sm:px-6';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 border border-xert-steel/25 px-4 text-sm font-semibold text-xert-pale transition-colors hover:border-xert-steel hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} border-xert-steel bg-xert-steel text-xert-navy hover:bg-xert-pale hover:text-xert-navy`;

function Toggle({ checked, onChange, label, description = '' }) {
  return <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4"><span><span className="block text-sm text-white">{label}</span>{description && <span className="block text-xs text-xert-pale/45">{description}</span>}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full border ${checked ? 'border-xert-steel bg-xert-steel' : 'border-xert-steel/25 bg-xert-deep'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} /></button></label>;
}
function FieldEditor({ field, fields, index, count, onUpdate, onMove, onDuplicate, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  const choices = field.type === 'yes_no' ? ['Yes', 'No'] : field.options || [];
  const layout = ['section_break', 'statement'].includes(field.type);
  const forwardDestinations = fields
    .map((destination, destinationIndex) => ({ destination, destinationIndex }))
    .filter(({ destinationIndex }) => destinationIndex >= index + 2);
  const validSkipTargets = new Set([
    ...forwardDestinations.map(({ destinationIndex }) => destinationIndex + 1),
    ...(index < count - 1 ? [count + 1] : []),
  ]);
  const hasInvalidSkipRules = (field.skip_rules || []).some(rule => !validSkipTargets.has(Number(rule.skip_to)));
  return <article className={`${panel} ${field.hidden ? 'opacity-60' : ''}`}>
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="text-xs font-bold uppercase tracking-widest text-xert-steel">{layout ? 'Layout' : `Q${index + 1}`}</span>
      <input className={`${control} flex-1`} value={layout ? field.content || '' : field.question || ''} onChange={event => onUpdate(layout ? 'content' : 'question', event.target.value)} placeholder={layout ? 'Section or information text' : 'Question or field label'} />
      <select className={`${control} sm:w-48`} value={field.type} onChange={event => onUpdate('type', event.target.value)}>{FIELD_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
      <button type="button" className={`${button} px-3`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse' : 'Edit'}</button>
    </div>
    {expanded && <div className="space-y-4 border-t border-xert-steel/15 p-4">
      {!layout && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-xert-pale/55">Helper text<input className={`${control} mt-1`} value={field.description || ''} onChange={event => onUpdate('description', event.target.value)} /></label><label className="text-xs text-xert-pale/55">Placeholder<input className={`${control} mt-1`} value={field.placeholder || ''} onChange={event => onUpdate('placeholder', event.target.value)} /></label></div>}
      {['single_choice', 'multiple_choice', 'dropdown'].includes(field.type) && <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-wider text-xert-pale/45">Options</p>{(field.options || []).map((option, optionIndex) => <div className="flex gap-2" key={`${field.id}-${optionIndex}`}><input className={control} value={option} onChange={event => onUpdate('options', field.options.map((item, i) => i === optionIndex ? event.target.value : item))} /><button type="button" aria-label={`Remove ${option}`} className={`${button} px-3`} onClick={() => onUpdate('options', field.options.filter((_, i) => i !== optionIndex))}><X className="h-4 w-4" /></button></div>)}<button type="button" className={button} onClick={() => onUpdate('options', [...(field.options || []), `Option ${(field.options || []).length + 1}`])}><Plus className="h-4 w-4" /> Add option</button><Toggle checked={Boolean(field.allow_other)} onChange={value => onUpdate('allow_other', value)} label="Allow an Other answer" /></div>}
      {['linear_scale', 'star_rating'].includes(field.type) && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-xs text-xert-pale/55">Minimum<input type="number" className={`${control} mt-1`} value={field.scale_min ?? 1} onChange={event => onUpdate('scale_min', Number(event.target.value))} /></label><label className="text-xs text-xert-pale/55">Maximum<input type="number" className={`${control} mt-1`} value={field.scale_max ?? 10} onChange={event => onUpdate('scale_max', Number(event.target.value))} /></label><label className="text-xs text-xert-pale/55">Minimum label<input className={`${control} mt-1`} value={field.scale_min_label || ''} onChange={event => onUpdate('scale_min_label', event.target.value)} /></label><label className="text-xs text-xert-pale/55">Maximum label<input className={`${control} mt-1`} value={field.scale_max_label || ''} onChange={event => onUpdate('scale_max_label', event.target.value)} /></label></div>}
      {CHOICE_TYPES.has(field.type) && choices.length > 0 && (index < count - 1 || hasInvalidSkipRules) && <div className="border-t border-xert-steel/15 pt-4"><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-xert-pale/45"><GitBranch className="h-4 w-4" /> Skip logic</p><div className="grid gap-2">{choices.map(option => { const rule = (field.skip_rules || []).find(item => item.option === option); const selectedTarget = validSkipTargets.has(Number(rule?.skip_to)) ? Number(rule.skip_to) : 0; return <label key={option} className="grid gap-2 text-sm text-xert-pale sm:grid-cols-[minmax(7rem,1fr)_auto_minmax(11rem,1.4fr)] sm:items-center"><span className="truncate">If “{option}”</span><ChevronRight className="hidden h-4 w-4 sm:block" /><select aria-label={`Skip destination for ${option}`} className={control} value={selectedTarget} onChange={event => { const others = (field.skip_rules || []).filter(item => item.option !== option); const target = Number(event.target.value); onUpdate('skip_rules', validSkipTargets.has(target) ? [...others, { option, skip_to: target }] : others); }}><option value={0}>Continue to next field</option>{forwardDestinations.map(({ destination, destinationIndex }) => <option key={destination.id} value={destinationIndex + 1}>Jump to Q{destinationIndex + 1}: {destination.question || destination.content || 'Untitled field'}</option>)}{index < count - 1 && <option value={count + 1}>End form</option>}</select></label>; })}</div>{hasInvalidSkipRules && <button type="button" className={`${button} mt-3 border-amber-300/30 text-amber-100`} onClick={() => onUpdate('skip_rules', (field.skip_rules || []).filter(rule => validSkipTargets.has(Number(rule.skip_to))))}>Clear obsolete skip rules</button>}<p className="mt-2 text-xs text-xert-pale/45">Only forward jumps are available, preventing loops and ignored rules.</p></div>}
      {!layout && <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs text-xert-pale/55">Media type<select className={`${control} mt-1`} value={field.media_type || ''} onChange={event => onUpdate('media_type', event.target.value || null)}><option value="">None</option><option value="image">Image</option><option value="video">Video</option><option value="link">Link</option></select></label><label className="text-xs text-xert-pale/55 sm:col-span-2">Media URL<input type="url" className={`${control} mt-1`} value={field.media_url || ''} onChange={event => onUpdate('media_url', event.target.value)} /></label></div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-xert-steel/15 pt-3">{!layout && <Toggle checked={Boolean(field.required)} onChange={value => onUpdate('required', value)} label="Required" />}<Toggle checked={Boolean(field.hidden)} onChange={value => onUpdate('hidden', value)} label="Hidden" /><span className="flex-1" /><button type="button" className={`${button} px-3`} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move field up"><ArrowUp className="h-4 w-4" /></button><button type="button" className={`${button} px-3`} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move field down"><ArrowDown className="h-4 w-4" /></button><button type="button" className={`${button} px-3`} onClick={onDuplicate}><Copy className="h-4 w-4" /></button><button type="button" className={`${button} px-3 text-red-300`} onClick={onRemove}><Trash2 className="h-4 w-4" /></button></div>
    </div>}
  </article>;
}

function FormEditor({ draft, setDraft, onSave, onCancel, saving, error, forms = [] }) {
  const [tab, setTab] = useState('fields');
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const updateField = (index, key, value) => update('questions', draft.questions.map((field, i) => i === index ? { ...field, [key]: value } : field));
  const moveField = (index, offset) => { const next = [...draft.questions]; const [field] = next.splice(index, 1); next.splice(index + offset, 0, field); update('questions', next); };
  return <div className={`${shell} max-w-5xl space-y-5 pb-24`}>
    <div className="sticky top-0 z-20 flex flex-col gap-4 border-b border-xert-steel/15 bg-xert-navy/95 py-3 backdrop-blur sm:flex-row sm:items-start"><button type="button" className={`${button} px-3`} onClick={onCancel}><ArrowLeft className="h-4 w-4" /> Back</button><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.24em] text-xert-steel">Form builder</p><input aria-label="Form title" className="mt-1 w-full bg-transparent font-display text-2xl uppercase tracking-wide text-white outline-none sm:text-5xl" value={draft.title} onChange={event => update('title', event.target.value)} /></div><button type="button" className={primary} disabled={saving} onClick={onSave}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save form</button></div>
    {error && <p role="alert" className="border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{error}</p>}
    <div className="flex overflow-x-auto border-b border-xert-steel/20"><button type="button" onClick={() => setTab('fields')} className={`min-h-12 shrink-0 px-5 text-sm font-semibold ${tab === 'fields' ? 'border-b-2 border-xert-steel text-white' : 'text-xert-pale/55'}`}><ClipboardList className="mr-2 inline h-4 w-4" />Fields</button><button type="button" onClick={() => setTab('settings')} className={`min-h-12 shrink-0 px-5 text-sm font-semibold ${tab === 'settings' ? 'border-b-2 border-xert-steel text-white' : 'text-xert-pale/55'}`}><Settings2 className="mr-2 inline h-4 w-4" />Settings</button></div>
    {tab === 'fields' ? <div className="space-y-3">{draft.questions.map((field, index) => <FieldEditor key={field.id} field={field} fields={draft.questions} index={index} count={draft.questions.length} onUpdate={(key, value) => updateField(index, key, value)} onMove={offset => moveField(index, offset)} onDuplicate={() => update('questions', [...draft.questions.slice(0, index + 1), { ...field, id: crypto.randomUUID(), question: `${field.question || field.content} (copy)` }, ...draft.questions.slice(index + 1)])} onRemove={() => update('questions', draft.questions.filter((_, i) => i !== index))} />)}<div className="grid gap-2 sm:grid-cols-3"><button type="button" className={`${button} border-dashed`} onClick={() => update('questions', [...draft.questions, createField()])}><Plus className="h-4 w-4" /> Add field</button><button type="button" className={`${button} border-dashed`} onClick={() => update('questions', [...draft.questions, createField('section_break')])}>Add section</button><button type="button" className={`${button} border-dashed`} onClick={() => update('questions', [...draft.questions, createField('statement')])}>Add statement</button></div></div> : <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${panel} space-y-4 p-5`}><h2 className="font-display text-2xl uppercase text-white">Respondent details</h2>{[['collect_name','collect_name_required','Name'],['collect_email','collect_email_required','Email'],['collect_phone','collect_phone_required','Phone']].map(([visible, required, label]) => <div key={visible} className="border-b border-xert-steel/10 pb-3"><Toggle checked={Boolean(draft[visible])} onChange={value => update(visible, value)} label={`Collect ${label.toLowerCase()}`} />{draft[visible] && <Toggle checked={Boolean(draft[required])} onChange={value => update(required, value)} label={`Require ${label.toLowerCase()}`} />}</div>)}<Toggle checked={draft.one_response_per_email} onChange={value => { update('one_response_per_email', value); if (value) { update('collect_email', true); update('collect_email_required', true); } }} label="One response per email" description="Email collection becomes required to prevent duplicate submissions" /></section>
      <section className={`${panel} space-y-4 p-5`}><h2 className="font-display text-2xl uppercase text-white">Publishing</h2><Toggle checked={draft.is_active} onChange={value => update('is_active', value)} label="Form is live" description="Public link accepts responses" /><Toggle checked={draft.show_progress_bar} onChange={value => update('show_progress_bar', value)} label="Show progress bar" /><Toggle checked={draft.notify_admin} onChange={value => update('notify_admin', value)} label="Flag new responses for owner review" /><label className="block text-xs text-xert-pale/55">Public link slug<input className={`${control} mt-1`} value={draft.slug} onChange={event => update('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></label><label className="block text-xs text-xert-pale/55">Complete this form first<select className={`${control} mt-1`} value={draft.prerequisite_form_id || ''} onChange={event => update('prerequisite_form_id', event.target.value || null)}><option value="">No form comes first</option>{forms.filter(item => item.id !== draft.id && item.is_active).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><span className="mt-1 block text-xert-pale/40">Anyone opening this link is sent to that form first, and comes back here the moment it is submitted.</span></label></section>
      <section className={`${panel} space-y-4 p-5 lg:col-span-2`}><h2 className="font-display text-2xl uppercase text-white">Introduction and completion</h2><label className="block text-xs text-xert-pale/55">Description<textarea rows={4} className={`${control} mt-1 py-3`} value={draft.description || ''} onChange={event => update('description', event.target.value)} /></label><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs text-xert-pale/55">Header media<select className={`${control} mt-1`} value={draft.header_media_type || ''} onChange={event => update('header_media_type', event.target.value || null)}><option value="">None</option><option value="image">Image</option><option value="video">Video</option><option value="link">Link</option></select></label><label className="text-xs text-xert-pale/55 sm:col-span-2">Media URL<input className={`${control} mt-1`} type="url" value={draft.header_media_url || ''} onChange={event => update('header_media_url', event.target.value)} /></label></div><label className="block text-xs text-xert-pale/55">Thank-you message<textarea rows={3} className={`${control} mt-1 py-3`} value={draft.thank_you_message || ''} onChange={event => update('thank_you_message', event.target.value)} /></label><label className="block text-xs text-xert-pale/55">Optional redirect URL<input className={`${control} mt-1`} type="url" value={draft.redirect_url || ''} onChange={event => update('redirect_url', event.target.value)} placeholder="https://" /></label></section>
    </div>}
  </div>;
}
/**
 * One option inside a question breakdown. Shows how many chose it and what
 * share of answers that is, and opens to name the people who chose it —
 * "how many said no" is rarely the real question; "who said no" is.
 */
function OptionBreakdown({ label, count, total, maximum, people, isOpen, onToggle }) {
  const share = total ? Math.round((count / total) * 100) : 0;
  const rowLabel = `${label}: ${count} of ${total} (${share}%)`;
  return (
    <div>
      <button type="button" onClick={onToggle} disabled={count === 0} aria-expanded={isOpen}
        aria-label={count === 0 ? `${rowLabel}. Nobody chose this.` : `${rowLabel}. Show who chose this.`}
        className="grid w-full grid-cols-[minmax(5rem,1fr)_2fr_auto] items-center gap-3 py-1 text-left text-sm disabled:cursor-default">
        <span className="flex min-w-0 items-center gap-1.5">
          {count > 0 && <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-xert-steel transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />}
          <span className="truncate text-xert-pale">{label}</span>
        </span>
        <span className="h-2 bg-xert-deep"><span className="block h-full bg-xert-steel" style={{ width: `${maximum ? count / maximum * 100 : 0}%` }} /></span>
        <span className="whitespace-nowrap text-right tabular-nums text-white">{count}<span className="ml-1 text-xs text-xert-pale/50">({share}%)</span></span>
      </button>
      {isOpen && (
        <ul className="mb-2 mt-1 space-y-1 border-l-2 border-xert-steel/35 pl-3">
          {people.map(person => (
            <li key={person.id} className="text-xs leading-5 text-xert-pale">
              <span className="text-white">{respondentLabel(person)}</span>
              {respondentIdentity(person).email && <> · <a className="text-xert-steel" href={`mailto:${respondentIdentity(person).email}`}>{respondentIdentity(person).email}</a></>}
              {respondentIdentity(person).phone && <> · <a className="text-xert-steel" href={`tel:${String(respondentIdentity(person).phone).replace(/\s+/g, '')}`}>{respondentIdentity(person).phone}</a></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Analytics({ form, onBack }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [selectedResponseID, setSelectedResponseID] = useState(null);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [loadingSelectedResponse, setLoadingSelectedResponse] = useState(false);
  const [updatingResponseID, setUpdatingResponseID] = useState(null);
  const [responseToArchive, setResponseToArchive] = useState(null);
  const [responseQuery, setResponseQuery] = useState('');
  const [openOption, setOpenOption] = useState(null);
  const [responseStatus, setResponseStatus] = useState('all');

  useEffect(() => {
    let current = true;
    setResponses([]);
    setSelectedResponseID(null);
    setLoading(true);
    setError('');
    listFormResponses(form.id)
      .then(items => { if (current) setResponses(items); })
      .catch(err => { if (current) setError(err.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [form.id]);

  useEffect(() => {
    let current = true;
    setSelectedResponse(null);
    if (!selectedResponseID) {
      setLoadingSelectedResponse(false);
      return () => { current = false; };
    }
    setLoadingSelectedResponse(true);
    setError('');
    getFormResponse(selectedResponseID)
      .then(item => { if (current) setSelectedResponse(item); })
      .catch(err => { if (current) setError(err.message); })
      .finally(() => { if (current) setLoadingSelectedResponse(false); });
    return () => { current = false; };
  }, [selectedResponseID]);

  const questions = activeQuestions(form);
  const filteredResponses = useMemo(() => {
    const needle = responseQuery.trim().toLocaleLowerCase('en-AU');
    return responses.filter(response => {
      if (responseStatus !== 'all' && response.status !== responseStatus) return false;
      if (!needle) return true;
      return [response.respondent_name, response.respondent_email, response.respondent_phone]
        .some(value => String(value || '').toLocaleLowerCase('en-AU').includes(needle));
    });
  }, [responseQuery, responseStatus, responses]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, offset) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 13 + offset);
    const key = date.toISOString().slice(0, 10);
    return { key, label: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), count: responses.filter(item => item.completed_at?.slice(0, 10) === key).length };
  }), [responses]);

  const download = () => {
    const blob = new Blob([responseCSV(form, responses)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${form.slug}-responses.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const updateStatus = async (response, status) => {
    if (status === response.status) return;
    setUpdatingResponseID(response.id); setError('');
    try {
      await updateFormResponseStatus(response.id, status);
      setResponses(current => current.map(item => item.id === response.id ? { ...item, status } : item));
      setSelectedResponse(current => current?.id === response.id ? { ...current, status } : current);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingResponseID(null);
    }
  };
  const archive = async () => {
    if (!responseToArchive) return;
    setUpdatingResponseID(responseToArchive.id); setError('');
    try {
      await archiveFormResponse(responseToArchive.id);
      setResponses(current => current.filter(item => item.id !== responseToArchive.id));
      setResponseToArchive(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingResponseID(null);
    }
  };

  const selectedResponseMatches = selectedResponseID && selectedResponse?.id === selectedResponseID;

  if (selectedResponseID && !selectedResponseMatches) {
    return <div className={`${shell} max-w-6xl space-y-4`}><button type="button" className={button} onClick={() => setSelectedResponseID(null)}><ArrowLeft className="h-4 w-4" /> All responses</button>{loadingSelectedResponse ? <p role="status" className="py-20 text-center text-xert-pale"><LoaderCircle className="mr-2 inline animate-spin" />Loading full response...</p> : <p role="alert" className="border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{error || 'This response could not be loaded.'}</p>}</div>;
  }

  if (selectedResponseMatches) {
    return <div className={`${shell} max-w-6xl`}><FormResponseRecord form={form} response={selectedResponse} responses={responses} onSelect={setSelectedResponseID} onBack={() => setSelectedResponseID(null)} onStatusChange={updateStatus} updating={updatingResponseID === selectedResponse.id} error={error} /></div>;
  }

  return <div className={`${shell} max-w-6xl space-y-5`}>
    <div className="flex flex-wrap items-center gap-3"><button className={button} onClick={onBack}><ArrowLeft className="h-4 w-4" /> Forms</button><div className="min-w-0 flex-1 basis-full sm:basis-0"><p className="text-xs font-bold uppercase tracking-widest text-xert-steel">Analytics</p><h1 className="truncate font-display text-3xl uppercase text-white sm:text-4xl">{form.title}</h1></div><button className={button} onClick={download} disabled={!responses.length}><Download className="h-4 w-4" /> Export CSV</button></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Responses',responses.length],['New',responses.filter(item => item.status === 'new').length],['Avg. time',responses.length ? `${Math.round(responses.reduce((sum,item) => sum + (item.time_taken_seconds || 0), 0) / responses.length)}s` : '—'],['Fields',questions.length]].map(([label,value]) => <div key={label} className={`${panel} p-4`}><p className="font-display text-3xl text-white">{value}</p><p className="text-xs uppercase tracking-wider text-xert-pale/45">{label}</p></div>)}</div>
    <div className="flex overflow-x-auto border-b border-xert-steel/20">{[['overview','Overview'],['responses','Responses'],['trends','Trends']].map(([value,label]) => <button key={value} onClick={() => setTab(value)} className={`min-h-12 shrink-0 px-5 text-sm font-semibold ${tab === value ? 'border-b-2 border-xert-steel text-white' : 'text-xert-pale/50'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{error}</p>}
    {loading ? <p role="status" className="py-20 text-center text-xert-pale"><LoaderCircle className="mr-2 inline animate-spin" />Loading responses…</p> : tab === 'overview' ? <div className="grid gap-4 lg:grid-cols-2">{questions.map(question => {
      const values = responses.map(item => item.answers?.[question.id]).filter(value => value !== undefined && value !== null && value !== '');
      if (CHARTABLE_TYPES.has(question.type)) {
        const flattened = values.flatMap(value => Array.isArray(value) ? value : [value]).map(String);
        const labels = question.type === 'yes_no' ? ['Yes','No'] : question.type === 'star_rating' ? ['1','2','3','4','5'] : question.type === 'nps' ? Array.from({length:11},(_,i) => String(i)) : question.options || [...new Set(flattened)];
        // Keep the respondents behind each option, not just the tally, so staff
        // can act on an answer (who declined photography, who needs clearance).
        const rows = labels.map(label => {
          const people = responses.filter(item => {
            const answer = item.answers?.[question.id];
            if (answer === undefined || answer === null || answer === '') return false;
            return (Array.isArray(answer) ? answer : [answer]).map(String).includes(String(label));
          });
          return { label, count: people.length, people };
        });
        const maximum = Math.max(1, ...rows.map(row => row.count));
        return <section className={`${panel} p-5`} key={question.id}><h2 className="font-semibold text-white">{question.question}</h2><p className="mb-4 text-xs text-xert-pale/40">{values.length} answers · select an option to see who</p><div className="space-y-1">{rows.map(row => <OptionBreakdown key={row.label} {...row} total={values.length} maximum={maximum} isOpen={openOption === `${question.id}:${row.label}`} onToggle={() => setOpenOption(current => current === `${question.id}:${row.label}` ? null : `${question.id}:${row.label}`)} />)}</div></section>;
      }
      return <section className={`${panel} p-5`} key={question.id}><h2 className="font-semibold text-white">{question.question}</h2><p className="mb-3 text-xs text-xert-pale/40">{values.length} answers</p><div className="max-h-56 space-y-2 overflow-y-auto">{values.slice(0,20).map((value,index) => <p key={index} className="border-l-2 border-xert-steel/35 pl-3 text-sm text-xert-pale">{typeof value === 'object' ? Object.values(value).filter(Boolean).join(', ') : String(value)}</p>)}</div></section>;
    })}</div> : tab === 'responses' ? <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]"><label className="relative"><span className="sr-only">Search respondents</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-xert-pale/35" /><input className={`${control} pl-10`} value={responseQuery} onChange={event => setResponseQuery(event.target.value)} placeholder="Search name, email or phone" /></label><select aria-label="Filter responses by status" className={control} value={responseStatus} onChange={event => setResponseStatus(event.target.value)}><option value="all">All statuses</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="followed_up">Followed up</option><option value="closed">Closed</option></select></div>
      <div className="space-y-3">{filteredResponses.map(response => <article key={response.id} className={`${panel} p-4 sm:p-5`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-white">{respondentLabel(response)}</h2><span className="border border-xert-steel/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-xert-pale/55">{String(response.status || 'new').replace('_', ' ')}</span></div><p className="mt-1 text-xs text-xert-pale/45">{new Date(response.completed_at).toLocaleString('en-AU')} · {response.time_taken_seconds || 0}s</p>{respondentIdentity(response).email && <a className="mt-1 block truncate text-sm text-xert-steel" href={`mailto:${respondentIdentity(response).email}`}>{respondentIdentity(response).email}</a>}{respondentIdentity(response).phone && <a className="mt-1 block text-sm text-xert-pale/60" href={`tel:${respondentIdentity(response).phone}`}>{respondentIdentity(response).phone}</a>}</div><div className="grid grid-cols-[1fr_auto] gap-2 sm:flex"><button type="button" className={primary} onClick={() => setSelectedResponseID(response.id)}><Eye className="h-4 w-4" /> View full form</button><button type="button" className={`${button} px-3 text-red-300`} onClick={() => setResponseToArchive(response)} aria-label={`Archive response from ${respondentLabel(response)}`}><Archive className="h-4 w-4" /></button></div></div></article>)}
        {!responses.length && <Empty title="No responses yet" detail="Share the live link to start collecting responses." />}
        {responses.length > 0 && !filteredResponses.length && <Empty title="No matching responses" detail="Clear the search or status filter to see other submissions." />}
      </div>
    </div> : <section className={`${panel} p-5`}><h2 className="mb-5 font-display text-2xl uppercase text-white">Last 14 days</h2><div className="flex h-56 items-end gap-2">{days.map(day => { const max = Math.max(1,...days.map(item => item.count)); return <div className="flex h-full flex-1 flex-col justify-end text-center" key={day.key}><span className="mb-1 text-xs text-white">{day.count || ''}</span><span className="min-h-1 bg-xert-steel" style={{height:`${Math.max(2,day.count/max*85)}%`}} /><span className="mt-2 hidden text-[10px] text-xert-pale/40 sm:block">{day.label}</span></div>; })}</div></section>}
    <AdminConfirmDialog open={Boolean(responseToArchive)} onOpenChange={open => !open && setResponseToArchive(null)} title="Archive this response?" description="It will be removed from analytics and the response list. The underlying record remains recoverable in the database." warning={undefined} cancelLabel="Keep response" confirmLabel="Archive response" busy={updatingResponseID === responseToArchive?.id} onConfirm={archive} />
  </div>;
}
function Empty({ title, detail }) { return <div className={`${panel} py-20 text-center`}><ClipboardList className="mx-auto h-12 w-12 text-xert-steel/30" /><h2 className="mt-4 font-display text-2xl uppercase text-white">{title}</h2><p className="mt-2 text-sm text-xert-pale/50">{detail}</p></div>; }

export default function FormsSurveysManager({ initialAction = null, onIntentHandled = () => {}, onDirtyChange = (_dirty) => {} }) {
  const [forms, setForms] = useState([]); const [loading, setLoading] = useState(true); const [view, setView] = useState('list');
  const [draft, setDraftState] = useState(null); const [active, setActive] = useState(null); const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [confirmArchive, setConfirmArchive] = useState(null); const [confirmDiscard, setConfirmDiscard] = useState(false);
  const handledIntent = useRef(false);
  const load = async () => { setLoading(true); try { setForms(await listOwnerForms()); setError(''); } catch (err) { setError(err.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const markDirty = value => { setDirty(value); onDirtyChange(value); };
  const setDraft = updater => { setDraftState(updater); markDirty(true); };
  const edit = form => { setDraftState(structuredClone(form)); setView('edit'); setError(''); markDirty(false); };
  const create = type => { setActive(null); setDraftState(createFormDraft(type)); setView('edit'); setError(''); markDirty(true); };
  const leaveEditor = () => { markDirty(false); setConfirmDiscard(false); setDraftState(null); setView(active ? 'manage' : 'list'); };
  const save = async () => { const validation = validateFormDraft(draft); if (validation) { setError(validation); return; } setSaving(true); try { const saved=await saveOwnerForm(draft); await load(); setActive(saved); setView('manage'); markDirty(false); setNotice('Form saved.'); } catch(err) { setError(err.message.includes('0 rows') ? 'This form changed elsewhere. Return to the list and reopen it before saving.' : err.message); } finally { setSaving(false); } };
  const duplicate = form => { const copy=structuredClone(form); delete copy.id; delete copy.created_at; delete copy.updated_at; copy.title=`${form.title} (Copy)`; copy.slug=slugifyFormTitle(copy.title); copy.is_active=false; copy.response_count=0; setDraftState(copy); setView('edit'); markDirty(true); };
  useEffect(() => {
    if (initialAction !== 'create' || handledIntent.current) return;
    handledIntent.current = true;
    setActive(null);
    setDraftState(createFormDraft('survey'));
    setView('edit');
    setError('');
    setDirty(true);
    onDirtyChange(true);
    onIntentHandled();
  }, [initialAction, onDirtyChange, onIntentHandled]); // Consume the URL intent once per mounted Forms workspace.
  const toggleLive = async form => { try { const saved=await saveOwnerForm({ ...form, is_active: !form.is_active }); setActive(saved); await load(); } catch(err){ setError(err.message); } };
  const filtered = forms.filter(form => (filter === 'all' || form.form_type === filter) && (!query || `${form.title} ${form.description}`.toLowerCase().includes(query.toLowerCase())));
  if (view === 'edit' && draft) return <><FormEditor draft={draft} setDraft={setDraft} forms={forms} onSave={save} saving={saving} error={error} onCancel={() => dirty ? setConfirmDiscard(true) : leaveEditor()} /><AdminConfirmDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Discard unsaved form changes?" description="Your edits have not been saved and cannot be recovered." warning={undefined} cancelLabel="Keep editing" confirmLabel="Discard changes" onConfirm={leaveEditor} /></>;
  if (view === 'analytics' && active) return <Analytics form={active} onBack={() => setView('manage')} />;
  if (view === 'manage' && active) {
    const url=publicFormURL(active); return <div className={`${shell} max-w-5xl space-y-5`}><div className="flex flex-wrap items-start gap-3"><button className={button} onClick={() => setView('list')}><ArrowLeft className="h-4 w-4" /> Forms</button><div className="min-w-0 flex-1 basis-full sm:basis-0"><span className={`text-xs font-bold uppercase tracking-widest ${active.is_active?'text-emerald-300':'text-xert-pale/40'}`}>{active.is_active?'Live':'Paused'}</span><h1 className="break-words font-display text-3xl uppercase text-white sm:text-5xl">{active.title}</h1></div><button className={button} onClick={() => edit(active)}><Pencil className="h-4 w-4" /> Edit</button><button className={primary} onClick={() => { setView('analytics'); }}><BarChart3 className="h-4 w-4" /> Analytics</button></div>
      {notice && <p role="status" className="border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">{notice}</p>}{error && <p role="alert" className="text-amber-200">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2"><section className={`${panel} p-5`}><h2 className="font-display text-2xl uppercase text-white">Share form</h2><p className="mt-1 text-sm text-xert-pale/50">Public links work on mobile and desktop without an account.</p><div className="mt-4 flex"><input readOnly value={url} className={`${control} min-w-0 flex-1`} /><button className={`${button} px-3`} onClick={async()=>{await navigator.clipboard.writeText(url);setNotice('Link copied.');}} aria-label="Copy public link"><Link2 className="h-4 w-4" /></button></div><div className="mt-3 flex flex-wrap gap-2"><a href={url} target="_blank" rel="noopener noreferrer" className={button}><Eye className="h-4 w-4" /> Preview</a>{navigator.share && <button className={button} onClick={()=>navigator.share({title:active.title,url})}><ExternalLink className="h-4 w-4" /> Share</button>}</div></section>
      <section className={`${panel} p-5`}><h2 className="font-display text-2xl uppercase text-white">Form controls</h2><div className="mt-4 grid gap-2"><button className={button} onClick={()=>toggleLive(active)}>{active.is_active?<><Pause className="h-4 w-4" /> Pause responses</>:<><Play className="h-4 w-4" /> Publish form</>}</button><button className={button} onClick={()=>duplicate(active)}><Copy className="h-4 w-4" /> Duplicate and edit</button><button className={`${button} text-red-300`} onClick={()=>setConfirmArchive(active)}><Archive className="h-4 w-4" /> Archive form</button></div></section>
      <FormQRCode form={active} publicURL={url} onNotice={setNotice} /></div>
      <div className="grid grid-cols-3 gap-3">{[['Responses',active.response_count||0],['Fields',activeQuestions(active).length],['Type',FORM_TYPES.find(type=>type.value===active.form_type)?.label||'Custom']].map(([label,value])=><div className={`${panel} p-4 text-center`} key={label}><p className="font-display text-2xl text-white">{value}</p><p className="text-xs uppercase tracking-wider text-xert-pale/40">{label}</p></div>)}</div>
      <AdminConfirmDialog open={Boolean(confirmArchive)} onOpenChange={open => !open && setConfirmArchive(null)} title="Archive this form?" description="The public link will stop accepting responses. Existing response history is preserved." warning={undefined} cancelLabel="Keep form" confirmLabel="Archive form" busy={saving} onConfirm={async()=>{setSaving(true);try{await archiveOwnerForm(confirmArchive);setConfirmArchive(null);setActive(null);setView('list');await load();}finally{setSaving(false);}}} />
    </div>;
  }
  return <div className={`${shell} max-w-6xl space-y-6`}><header className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.24em] text-xert-steel">Engage and learn</p><h1 className="font-display text-3xl uppercase tracking-wide text-white sm:text-5xl">Forms & surveys</h1><p className="mt-2 max-w-2xl text-sm text-xert-pale/55">Build branded forms, publish a link, review every response and spot trends from any device.</p></div><select aria-label="New form type" className={`${control} sm:w-56`} defaultValue="" onChange={event=>{if(event.target.value)create(event.target.value);event.target.value='';}}><option value="">+ New form…</option>{FORM_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></header>
    {error && <p role="alert" className="border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{error}</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Total forms',forms.length],['Live',forms.filter(item=>item.is_active).length],['Responses',forms.reduce((sum,item)=>sum+(item.response_count||0),0)],['Types used',new Set(forms.map(item=>item.form_type)).size]].map(([label,value])=><div key={label} className={`${panel} p-4`}><p className="font-display text-2xl text-white sm:text-3xl">{value}</p><p className="text-xs uppercase tracking-wider text-xert-pale/40">{label}</p></div>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">Search forms</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-xert-pale/35" /><input className={`${control} pl-10`} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search forms" /></label><select className={`${control} sm:w-52`} value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All form types</option>{FORM_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
    {loading ? <p role="status" className="py-20 text-center text-xert-pale"><LoaderCircle className="mr-2 inline animate-spin" />Loading forms…</p> : filtered.length ? <div className="grid gap-3 lg:grid-cols-2">{filtered.map(form=><button type="button" key={form.id} onClick={()=>{setActive(form);setView('manage');}} className={`${panel} group p-5 text-left transition-colors hover:border-xert-steel/55`}><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center bg-xert-steel/10 text-xert-steel"><ClipboardList className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold text-white">{form.title}</span><span className={`text-[10px] font-bold uppercase tracking-wider ${form.is_active?'text-emerald-300':'text-xert-pale/35'}`}>{form.is_active?'Live':'Paused'}</span></span><span className="mt-1 block text-xs text-xert-pale/45">{FORM_TYPES.find(type=>type.value===form.form_type)?.label} · {activeQuestions(form).length} fields · {form.response_count||0} responses</span></span><ChevronRight className="mt-2 h-5 w-5 text-xert-steel/45 transition-transform group-hover:translate-x-1" /></div></button>)}</div> : <Empty title="No forms yet" detail="Create a survey, registration, application, feedback form or anything else Byron needs." />}
  </div>;
}

FormsSurveysManager.displayName = 'FormsSurveysManager';
