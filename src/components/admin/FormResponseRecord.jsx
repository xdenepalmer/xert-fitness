import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, FileText, Printer } from 'lucide-react';
import {
  fieldsForResponseRecord, formatResponseAnswer, formDefinitionForResponse,
  responseAnswerIsPresent, responseFileDetails, safeResponseMediaURL, safeResponseSignatureURL,
} from '@/lib/formResponseRecord';
import { waitForPrintableImages } from '@/lib/printReady';

const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 border border-xert-steel/25 px-4 text-sm font-semibold text-xert-pale transition-colors hover:border-xert-steel hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
const printButton = `${secondaryButton} border-xert-steel bg-xert-steel text-xert-navy hover:bg-xert-pale`;
const statusLabels = { new: 'New', reviewed: 'Reviewed', followed_up: 'Followed up', closed: 'Closed' };

function formatSubmittedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Submission time unavailable';
  return date.toLocaleString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Australia/Brisbane', timeZoneName: 'short',
  });
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return 'Not recorded';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function printableTitle(definition, response) {
  const submitted = new Date(response?.completed_at);
  const date = Number.isNaN(submitted.getTime()) ? 'response' : submitted.toISOString().slice(0, 10);
  return `${definition.title} — response ${date} | XERT Fitness`;
}

function ChoiceAnswer({ question, value }) {
  const multiple = question.type === 'multiple_choice';
  const selected = (multiple ? (Array.isArray(value) ? value : []) : [value])
    .filter(responseAnswerIsPresent)
    .map(String);
  const configured = question.type === 'yes_no' ? ['Yes', 'No'] : question.options || [];
  const options = [...configured.filter(option => typeof option === 'string'), ...selected.filter(option => !configured.includes(option))];

  if (!options.length) return <AnswerText value={value} />;
  return (
    <div>
      <div className="xert-response-choices grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const checked = selected.includes(option);
          return <div className={`flex min-h-10 items-center gap-3 border px-3 py-2 ${checked ? 'border-slate-600 bg-slate-100' : 'border-slate-200'}`} key={`${option}-${index}`}><span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center border border-slate-500 ${multiple ? '' : 'rounded-full'} ${checked ? 'bg-slate-800 text-white' : ''}`}>{checked && <Check className="h-3.5 w-3.5" />}</span><span className={`min-w-0 break-words ${checked ? 'font-semibold text-slate-950' : 'text-slate-500'}`}>{option}</span></div>;
        })}
      </div>
      {!selected.length && <p className="mt-2 text-sm italic text-slate-500">Not answered</p>}
    </div>
  );
}

function FileAnswer({ value }) {
  const file = responseFileDetails(value);
  if (!file) return <AnswerText value={value} />;
  return <div className="flex items-start gap-3"><FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><div><p className="break-all font-semibold text-slate-950">{file.name}</p><p className="mt-0.5 text-xs text-slate-500">{[file.type, file.sizeLabel].filter(Boolean).join(' · ') || 'File details recorded'}</p><p className="mt-1 text-xs italic text-slate-500">File metadata only — no file was uploaded.</p></div></div>;
}

function SignatureAnswer({ value }) {
  if (!responseAnswerIsPresent(value)) return <p className="text-sm italic text-slate-500">Not answered</p>;
  const source = safeResponseSignatureURL(value);
  if (!source) return <p className="text-sm italic text-slate-500">Signature captured, but its preview is unavailable.</p>;
  const inkClass = source.startsWith('data:image/png;base64,') ? 'xert-response-signature-image' : '';
  return <div className="xert-response-signature border-b border-slate-400 pb-2"><img alt="Respondent signature" className={`${inkClass} max-h-36 max-w-full object-contain object-left`} src={source} /></div>;
}

function AnswerText({ value }) {
  const file = responseFileDetails(value);
  if (file) return <FileAnswer value={value} />;
  const signature = safeResponseSignatureURL(value);
  if (signature) return <SignatureAnswer value={value} />;
  const answer = formatResponseAnswer(value);
  return answer
    ? <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-950">{answer}</p>
    : <p className="text-sm italic text-slate-500">Not answered</p>;
}

function RatingAnswer({ question, value }) {
  if (!responseAnswerIsPresent(value)) return <AnswerText value={value} />;
  if (question.type === 'star_rating') {
    const selected = Number(value); const maximum = Number(question.scale_max ?? 5);
    const safeMaximum = Number.isInteger(maximum) && maximum > 0 && maximum <= 10 ? maximum : 5;
    return <p className="text-lg font-semibold tracking-widest text-slate-950">{Array.from({ length: safeMaximum }, (_, index) => index < selected ? '★' : '☆').join('')} <span className="ml-2 text-sm font-normal tracking-normal text-slate-600">{value} of {safeMaximum}</span></p>;
  }
  const minimum = question.type === 'nps' ? 0 : Number(question.scale_min ?? 1);
  const maximum = question.type === 'nps' ? 10 : Number(question.scale_max ?? 10);
  return <div><p className="font-semibold text-slate-950">{String(value)} <span className="font-normal text-slate-500">of {maximum}</span></p>{(question.scale_min_label || question.scale_max_label) && <p className="mt-1 text-xs text-slate-500">{question.scale_min_label || minimum} — {question.scale_max_label || maximum}</p>}</div>;
}

function FieldAnswer({ question }) {
  if (['single_choice', 'multiple_choice', 'dropdown', 'yes_no'].includes(question.type)) return <ChoiceAnswer question={question} value={question.answer} />;
  if (['star_rating', 'linear_scale', 'nps'].includes(question.type)) return <RatingAnswer question={question} value={question.answer} />;
  if (question.type === 'signature') return <SignatureAnswer value={question.answer} />;
  if (question.type === 'file_upload') return <FileAnswer value={question.answer} />;
  return <AnswerText value={question.answer} />;
}

function ResponseField({ field, number }) {
  if (field.type === 'section_break') return <div className="xert-response-section mt-8 border-b-2 border-slate-900 pb-2 first:mt-0"><h2 className="text-xl font-bold uppercase tracking-wide text-slate-950">{field.content || 'Untitled section'}</h2>{field.description && <p className="mt-1 whitespace-pre-wrap text-sm normal-case leading-6 tracking-normal text-slate-600">{field.description}</p>}</div>;
  if (field.type === 'statement') return <div className="xert-response-statement border-l-4 border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"><p className="whitespace-pre-wrap">{field.content || 'Information statement'}</p>{field.description && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">{field.description}</p>}</div>;
  const mediaURL = safeResponseMediaURL(field.media_url);
  return (
    <section className="xert-response-field border border-slate-200 p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 min-w-7 text-xs font-bold uppercase tracking-wider text-slate-400">{number}</span>
        <div className="min-w-0 flex-1"><h2 className="font-semibold leading-6 text-slate-950">{field.question || 'Untitled field'}{field.required && <span className="ml-1 text-red-700" aria-label="Required">*</span>}</h2>{field.description && <p className="mt-1 text-xs leading-5 text-slate-500">{field.description}</p>}{field.hidden && <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Historical hidden field with stored answer</p>}</div>
      </div>
      <div className="pl-0 sm:pl-10"><FieldAnswer question={field} /></div>
      {(mediaURL || field.media_caption) && <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500"><p className="font-bold uppercase tracking-wider">Configured {field.media_type || 'media'} reference</p>{field.media_caption && <p className="mt-1 whitespace-pre-wrap text-slate-600">{field.media_caption}</p>}{mediaURL && <p className="mt-1 break-all">{mediaURL}</p>}<p className="mt-1 italic">The reference was preserved at submission; content served by this external URL may change.</p></div>}
    </section>
  );
}

function MetadataItem({ label, children, wide = false }) {
  return <div className={wide ? 'sm:col-span-2' : ''}><dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-950">{children || 'Not provided'}</dd></div>;
}

export default function FormResponseRecord({ form, response, responses, onSelect, onBack, onStatusChange, updating = false, error = '' }) {
  const headingRef = useRef(null);
  const recordRef = useRef(null);
  const definition = useMemo(() => formDefinitionForResponse(form, response), [form, response]);
  const record = useMemo(() => fieldsForResponseRecord(definition, response), [definition, response]);
  const responseIndex = responses.findIndex(item => item.id === response.id);
  const newer = responseIndex > 0 ? responses[responseIndex - 1] : null;
  const older = responseIndex >= 0 && responseIndex < responses.length - 1 ? responses[responseIndex + 1] : null;
  const respondent = response.respondent_name || response.respondent_email || 'Anonymous response';
  const pageTitle = useMemo(() => printableTitle(definition, response), [definition.title, response.completed_at]);
  const printRecord = async () => {
    await waitForPrintableImages(recordRef.current);
    window.print();
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.body.classList.add('xert-response-detail-open');
    document.title = pageTitle;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return () => {
      document.body.classList.remove('xert-response-detail-open');
      document.title = previousTitle;
    };
  }, [pageTitle, response.id]);

  let questionNumber = 0;
  return (
    <div className="space-y-4">
      <div className="xert-print-controls sticky top-0 z-20 -mx-4 grid gap-3 border-y border-xert-steel/20 bg-xert-navy/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex sm:flex-wrap sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" className={secondaryButton} onClick={onBack}><ArrowLeft className="h-4 w-4" /> All responses</button>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" className={secondaryButton} disabled={!newer} onClick={() => newer && onSelect(newer.id)}><ChevronLeft className="h-4 w-4" /> Newer</button>
          <button type="button" className={secondaryButton} disabled={!older} onClick={() => older && onSelect(older.id)}>Older <ChevronRight className="h-4 w-4" /></button>
        </div>
        <p className="text-center text-xs tabular-nums text-xert-pale/50 sm:mr-auto sm:text-left">Response {responseIndex + 1} of {responses.length}</p>
        <button type="button" className={printButton} onClick={printRecord}><Printer className="h-4 w-4" /> Print / Save PDF</button>
      </div>
      {error && <p role="alert" className="xert-print-controls border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{error}</p>}

      <article ref={recordRef} className="xert-response-print-record mx-auto max-w-[850px] bg-white text-slate-950 shadow-2xl shadow-black/30" aria-labelledby="response-record-title">
        <header className="border-b-4 border-slate-950 px-5 py-6 sm:px-10 sm:py-8">
          <div className="flex items-start justify-between gap-5">
            <div><p className="text-2xl font-black tracking-[0.18em] text-slate-950">XERT</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Fitness · Form response</p></div>
            <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</p><p className="mt-1 text-sm font-semibold text-slate-950">{statusLabels[response.status] || 'Unlabelled'}</p></div>
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Completed record</p>
          <h1 ref={headingRef} tabIndex={-1} id="response-record-title" className="mt-2 break-words text-3xl font-black leading-tight text-slate-950 outline-none sm:text-4xl">{definition.title}</h1>
          {definition.description && <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{definition.description}</p>}
          {(safeResponseMediaURL(definition.headerMediaURL) || definition.headerMediaCaption) && <div className="mt-4 border border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p className="font-bold uppercase tracking-wider text-slate-700">Configured {definition.headerMediaType || 'header media'} reference</p>{definition.headerMediaCaption && <p className="mt-1 whitespace-pre-wrap">{definition.headerMediaCaption}</p>}{safeResponseMediaURL(definition.headerMediaURL) && <p className="mt-1 break-all">{safeResponseMediaURL(definition.headerMediaURL)}</p>}<p className="mt-1 italic text-slate-500">The reference was preserved at submission; content served by this external URL may change.</p></div>}
        </header>

        <div className="px-5 py-6 sm:px-10 sm:py-8">
          <section className="xert-response-metadata border border-slate-300 bg-slate-50 p-4 sm:p-5">
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <MetadataItem label="Respondent">{respondent}</MetadataItem>
              <MetadataItem label="Submitted">{formatSubmittedAt(response.completed_at)}</MetadataItem>
              <MetadataItem label="Email">{response.respondent_email}</MetadataItem>
              <MetadataItem label="Phone">{response.respondent_phone}</MetadataItem>
              <MetadataItem label="Completion time">{formatDuration(response.time_taken_seconds)}</MetadataItem>
              <MetadataItem label="Record ID">{response.id}</MetadataItem>
              {response.source_url && <MetadataItem label="Submission source" wide>{response.source_url}</MetadataItem>}
            </div>
          </section>

          <div className="xert-print-controls mt-4 flex flex-col gap-2 border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor={`response-status-${response.id}`}>Workflow status</label>
            <select id={`response-status-${response.id}`} className="min-h-11 border border-slate-300 bg-white px-3 text-base text-slate-950 sm:ml-auto sm:min-w-44" value={response.status} disabled={updating} onChange={event => onStatusChange(response, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>

          <div className="mt-7 space-y-4">
            {record.fields.map(field => {
              if (!field.isLayout) questionNumber += 1;
              return <ResponseField key={field.recordKey} field={field} number={field.isLayout ? null : questionNumber} />;
            })}
            {!record.fields.length && <p className="border border-slate-200 p-5 text-sm italic text-slate-500">The original form definition is unavailable for this legacy response.</p>}
          </div>

          {record.skippedItems.length > 0 && <aside className="mt-4 border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong>{record.skippedItems.length} {record.skippedItems.length === 1 ? 'item was' : 'items were'} not presented</strong> because of the respondent’s earlier answers and the form’s branching rules. Omitted questions and statements are not represented as unanswered fields.</aside>}

          {record.unverifiedLayoutItems.length > 0 && <section className="mt-8 border border-amber-700/30 bg-amber-50 p-4 sm:p-5"><h2 className="text-lg font-bold text-amber-950">Reconstructed form layout — not verified as presented</h2><p className="mt-1 text-xs leading-5 text-amber-900">These information blocks exist in the current form definition, but this legacy submission predates reliable layout capture. They are excluded from the filled-form body and listed here only for context.</p><div className="mt-4 space-y-3">{record.unverifiedLayoutItems.map((item, index) => <div className="border-t border-amber-800/20 pt-3 first:border-0 first:pt-0" key={item.id || index}><p className="text-[10px] font-bold uppercase tracking-wider text-amber-900">{item.type === 'section_break' ? 'Section heading' : 'Information statement'}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">{item.content || 'Untitled layout block'}</p>{item.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-amber-900">{item.description}</p>}</div>)}</div></section>}

          {record.unmatchedAnswers.length > 0 && <section className="xert-response-unmatched mt-8 border-2 border-dashed border-slate-300 p-4 sm:p-5"><h2 className="text-lg font-bold text-slate-950">Unmatched archived answers</h2><p className="mt-1 text-xs leading-5 text-slate-500">These submitted values no longer match a field in the preserved form definition. They are retained here so the record remains complete.</p><dl className="mt-4 space-y-4">{record.unmatchedAnswers.map(({ id, answer }) => <div className="border-t border-slate-200 pt-3 first:border-0 first:pt-0" key={id}><dt className="break-all font-mono text-xs text-slate-500">Field ID: {id}</dt><dd className="mt-1"><AnswerText value={answer} /></dd></div>)}</dl></section>}

          {record.administrativeAnswers.length > 0 && <section className="xert-response-administrative mt-8 border border-slate-300 bg-slate-50 p-4 sm:p-5"><h2 className="text-lg font-bold text-slate-950">Administrative archived data</h2><p className="mt-1 text-xs leading-5 text-slate-500">These stored values belong to hidden or branched-away fields. They are retained for record integrity and are not represented as questions the respondent saw or completed.</p><dl className="mt-4 space-y-4">{record.administrativeAnswers.map(({ id, question, answer, reason }) => <div className="border-t border-slate-200 pt-3 first:border-0 first:pt-0" key={id}><dt className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{reason === 'branched' ? 'Branched-away field' : 'Hidden field'}</span><span className="mt-0.5 block break-all font-mono">Field ID: {id}</span>{question.question && <span className="mt-0.5 block">Administrative label: {question.question}</span>}</dt><dd className="mt-1"><AnswerText value={answer} /></dd></div>)}</dl></section>}

          <footer className="mt-10 border-t border-slate-300 pt-4 text-[10px] leading-4 text-slate-500"><p><span className="font-semibold">Record details:</span> {definition.usesSubmissionSnapshot ? 'Form definition preserved at submission.' : 'Submitted answers are original; labels and layout were reconstructed from the current form and may not be exact.'}</p><p className="mt-1">Private administrative record · Generated by XERT Fitness</p></footer>
        </div>
      </article>
    </div>
  );
}
