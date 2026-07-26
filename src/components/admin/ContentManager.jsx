import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Phone, HelpCircle, FileText, Ticket, Image, ExternalLink, GripVertical, RotateCcw } from 'lucide-react';
import { getAllSiteContent, saveSiteContent } from '@/lib/adminData';
import { clearSiteContentCache } from '@/lib/siteContent';
import { CONTENT_DEFAULTS } from '@/lib/contentDefaults';
import { toast } from '@/components/ui/use-toast';
import ImageUploader from '@/components/admin/ImageUploader';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { normalizeSiteContent } from '@/lib/siteContentAdmin';
import {
  clearSiteContentDraft,
  isSiteContentDraftCurrent,
  readSiteContentDraft,
  writeSiteContentDraft,
} from '@/lib/siteContentDraft';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

// Schema-driven CMS editor. Add a section here + a useSiteContent() call in the
// matching public component and it becomes editable — no other wiring needed.
// Field types: text · textarea · qa_list · text_list · image_list
const SECTIONS = [
  {
    key: 'hero',
    title: 'Homepage Hero',
    icon: Home,
    viewPath: '/',
    description: 'The first thing every visitor sees — headline, copy and the rotating photo carousel.',
    fields: [
      { key: 'headline', label: 'Headline', type: 'text', placeholder: 'Beat Your Best.' },
      { key: 'subheading', label: 'Subheading', type: 'textarea', placeholder: 'Structured functional fitness coaching…' },
      { key: 'supporting', label: 'Supporting line', type: 'textarea', placeholder: 'Semi-private training in Kingaroy…' },
      { key: 'photos', label: 'Hero photos (rotating carousel)', type: 'image_list', folder: 'hero' },
    ],
  },
  {
    key: 'booking',
    title: 'Booking Page Intro',
    icon: Ticket,
    viewPath: '/booking',
    description: 'The heading area on the booking & packs page.',
    fields: [
      { key: 'intro', label: 'Intro paragraph', type: 'textarea', placeholder: 'XERT operates through a booking-based system…' },
    ],
  },
  {
    key: 'about',
    title: 'About Page',
    icon: FileText,
    viewPath: '/about',
    description: 'The paragraphs on the About XERT page.',
    fields: [
      { key: 'paragraphs', label: 'Paragraphs', type: 'text_list', itemLabel: 'Paragraph' },
    ],
  },
  {
    key: 'contact',
    title: 'Contact Details',
    icon: Phone,
    viewPath: '/contact',
    description: 'Used on the Contact page and the site footer.',
    fields: [
      { key: 'email', label: 'Email', type: 'text', placeholder: 'byronhawley@gmail.com' },
      { key: 'phone', label: 'Phone (optional)', type: 'text', placeholder: '04xx xxx xxx' },
      { key: 'address', label: 'Address / location', type: 'text', placeholder: 'Kingaroy, Queensland 4610' },
      { key: 'instagram_handle', label: 'Instagram handle', type: 'text', placeholder: '@xert_fit' },
      { key: 'instagram_url', label: 'Instagram URL', type: 'text', placeholder: 'https://instagram.com/xert_fit' },
      { key: 'intro', label: 'Contact page intro', type: 'textarea', placeholder: 'Have a question about classes…' },
    ],
  },
  {
    key: 'faq',
    title: 'FAQ',
    icon: HelpCircle,
    viewPath: '/#',
    description: 'Questions shown on the homepage. Leave empty to use the built-in defaults.',
    fields: [
      { key: 'items', label: 'Questions & answers', type: 'qa_list' },
    ],
  },
];

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';
/** @param {boolean} _dirty */
const NOOP = _dirty => {};

function QaListEditor({ value, onChange, idPrefix }) {
  const items = Array.isArray(value) ? value : [];
  const update = (i, field, v) => onChange(items.map((it, idx) => (idx === i ? { ...it, [field]: v } : it)));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-xert-steel/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-body text-xs text-xert-concrete/40 uppercase">
              <GripVertical className="w-3 h-3" /> Q{i + 1}
            </span>
            <div className="flex gap-1">
              <button type="button" aria-label={`Move question ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0} className="min-w-11 min-h-11 border border-xert-steel/30 text-xert-concrete/50 text-xs hover:border-xert-steel disabled:opacity-30">&#8593;</button>
              <button type="button" aria-label={`Move question ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === items.length - 1} className="min-w-11 min-h-11 border border-xert-steel/30 text-xert-concrete/50 text-xs hover:border-xert-steel disabled:opacity-30">&#8595;</button>
              <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="min-w-11 min-h-11 border border-xert-red/30 text-xert-red/60 text-xs hover:border-xert-red/60">&#10005;</button>
            </div>
          </div>
          <label htmlFor={`${idPrefix}-${i}-question`} className="sr-only">Question {i + 1}</label>
          <input id={`${idPrefix}-${i}-question`} value={item.q || ''} onChange={e => update(i, 'q', e.target.value)} placeholder="Question" className={inputCls} />
          <label htmlFor={`${idPrefix}-${i}-answer`} className="sr-only">Answer {i + 1}</label>
          <textarea id={`${idPrefix}-${i}-answer`} value={item.a || ''} onChange={e => update(i, 'a', e.target.value)} placeholder="Answer" rows={2} className={`${inputCls} resize-none`} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { q: '', a: '' }])}
        className="px-4 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase hover:border-xert-steel transition-colors">
        + Add question
      </button>
    </div>
  );
}

function TextListEditor({ value, onChange, itemLabel = 'Item', idPrefix }) {
  const items = Array.isArray(value) ? value : [];
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((text, i) => (
        <div key={i} className="border border-xert-steel/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-xert-concrete/40 uppercase">{itemLabel} {i + 1}</span>
            <div className="flex gap-1">
              <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0} className="min-w-11 min-h-11 border border-xert-steel/30 text-xert-concrete/50 text-xs hover:border-xert-steel disabled:opacity-30">&#8593;</button>
              <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === items.length - 1} className="min-w-11 min-h-11 border border-xert-steel/30 text-xert-concrete/50 text-xs hover:border-xert-steel disabled:opacity-30">&#8595;</button>
              <button type="button" aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="min-w-11 min-h-11 border border-xert-red/30 text-xert-red/60 text-xs hover:border-xert-red/60">&#10005;</button>
            </div>
          </div>
          <label htmlFor={`${idPrefix}-${i}`} className="sr-only">{itemLabel} {i + 1}</label>
          <textarea id={`${idPrefix}-${i}`} value={text} onChange={e => onChange(items.map((t, idx) => idx === i ? e.target.value : t))}
            rows={3} className={`${inputCls} resize-none`} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])}
        className="px-4 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase hover:border-xert-steel transition-colors">
        + Add {itemLabel.toLowerCase()}
      </button>
    </div>
  );
}

function ImageListEditor({ value, onChange, folder }) {
  const items = Array.isArray(value) ? value : [];
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {items.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group border border-xert-steel/20">
              <div className="aspect-[3/4] overflow-hidden bg-xert-charcoal">
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 py-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
                style={{ backgroundColor: 'rgba(11,18,24,0.85)' }}>
                <button type="button" aria-label={`Move photo ${i + 1} left`} disabled={i === 0} onClick={() => move(i, -1)} className="min-w-11 min-h-11 text-xs disabled:opacity-30" style={{ color: '#7BA7BC' }}>&#8592;</button>
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="min-w-11 min-h-11 text-xs" style={{ color: '#f0a1a1' }}>&#10005;</button>
                <button type="button" aria-label={`Move photo ${i + 1} right`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="min-w-11 min-h-11 text-xs disabled:opacity-30" style={{ color: '#7BA7BC' }}>&#8594;</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ImageUploader value="" onChange={url => { if (url) onChange([...items, url]); }} folder={folder} label="Add photo" />
    </div>
  );
}

function recoverCurrentDraft(userId, sectionKey, expectedUpdatedAt) {
  const draft = readSiteContentDraft(window.localStorage, userId, sectionKey);
  if (!draft) return null;
  // Drafts written before baseUpdatedAt existed, or against an older live
  // revision, must not overlay newer published copy after a reload/remount.
  if (!isSiteContentDraftCurrent(draft, expectedUpdatedAt)) {
    clearSiteContentDraft(window.localStorage, userId, sectionKey);
    return null;
  }
  return draft;
}

function SectionEditor({ section, initial, expectedUpdatedAt, onSaved, onDirtyChange, userId }) {
  // Prefill with the live defaults so the editor always shows what the site
  // is currently displaying — saved CMS values overlay the defaults.
  const defaults = CONTENT_DEFAULTS[section.key] || {};
  const baseline = { ...defaults, ...(initial || {}) };
  const [recoveredDraft] = useState(() => recoverCurrentDraft(userId, section.key, expectedUpdatedAt));
  const [data, setData] = useState(() => ({ ...baseline, ...(recoveredDraft?.data || {}) }));
  const [dirty, setDirty] = useState(Boolean(recoveredDraft));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const draftBaseRef = useRef(expectedUpdatedAt ?? null);
  const lateDraftUserIdRef = useRef(userId || null);
  const set = (k, v) => { setData(p => ({ ...p, [k]: v })); setDirty(true); };
  const Icon = section.icon;

  useEffect(() => {
    onDirtyChange(section.key, dirty);
  }, [dirty, onDirtyChange, section.key]);

  useEffect(() => () => onDirtyChange(section.key, false), [onDirtyChange, section.key]);

  useEffect(() => {
    if (dirty) {
      writeSiteContentDraft(window.localStorage, userId, section.key, data, {
        baseUpdatedAt: draftBaseRef.current,
      });
    }
  }, [data, dirty, section.key, userId]);

  // Auth can resolve after the first CMS paint. Retry draft recovery once the
  // signed-in admin id is known so a mid-session refresh still restores work.
  useEffect(() => {
    const previousUserId = lateDraftUserIdRef.current;
    lateDraftUserIdRef.current = userId || null;
    if (!userId || previousUserId || dirty) return;
    const recovered = recoverCurrentDraft(userId, section.key, expectedUpdatedAt);
    if (!recovered) return;
    setData({ ...CONTENT_DEFAULTS[section.key], ...(initial || {}), ...recovered.data });
    setDirty(true);
  }, [userId, dirty, section.key, expectedUpdatedAt, initial]);

  // Another tab/admin published a newer revision while this editor held a
  // draft: drop the stale local overlay instead of letting Save CAS-blindly
  // overwrite the live section with older copy.
  useEffect(() => {
    const serverBase = expectedUpdatedAt ?? null;
    if (serverBase === (draftBaseRef.current ?? null)) return;
    clearSiteContentDraft(window.localStorage, userId, section.key);
    if (dirty) {
      setData({ ...CONTENT_DEFAULTS[section.key], ...(initial || {}) });
      setDirty(false);
      toast({
        title: `${section.title} updated elsewhere`,
        description: 'The live section changed. Local draft changes were cleared so you can review the latest copy.',
        variant: 'destructive',
      });
    }
    draftBaseRef.current = serverBase;
  }, [expectedUpdatedAt, userId, section.key, section.title, dirty, initial]);

  const handleRestore = () => {
    setData({ ...defaults });
    setDirty(true);
  };

  const handleDiscard = () => {
    setData(baseline);
    setDirty(false);
    clearSiteContentDraft(window.localStorage, userId, section.key);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const clean = normalizeSiteContent(section.key, data);
      await saveSiteContent(section.key, clean, expectedUpdatedAt);
      clearSiteContentCache();
      setSavedAt(new Date());
      setDirty(false);
      clearSiteContentDraft(window.localStorage, userId, section.key);
      await onSaved();
      toast({ title: `${section.title} saved`, description: 'Changes are live on the site.' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(50,72,90,0.18) 0%, rgba(16,24,32,0.55) 70%)',
      border: `1px solid ${dirty ? 'rgba(123,167,188,0.5)' : 'rgba(123,167,188,0.16)'}`,
    }}>
      {/* Section header */}
      <div className="flex items-center gap-3 p-5" style={{ borderBottom: '1px solid rgba(123,167,188,0.12)' }}>
        <div className="w-9 h-9 shrink-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
          <Icon className="w-4 h-4" style={{ color: '#7BA7BC' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg text-xert-offwhite uppercase leading-none">{section.title}</h3>
          <p className="font-body text-xs text-xert-concrete/40 mt-1">{section.description}</p>
        </div>
        <Link to={section.viewPath} target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 font-body text-[10px] uppercase tracking-wider border transition-colors shrink-0"
          style={{ borderColor: 'rgba(123,167,188,0.25)', color: 'rgba(123,167,188,0.7)' }}>
          <ExternalLink className="w-3 h-3" /> View
        </Link>
      </div>

      <div className="p-5 space-y-4">
        {section.fields.map(f => (
          <div key={f.key}>
            {['text', 'textarea'].includes(f.type)
              ? <label htmlFor={`${section.key}-${f.key}`} className={labelCls}>{f.label}</label>
              : f.type !== 'image_list' && <p className={labelCls}>{f.label}</p>}
            {f.type === 'textarea' ? (
              <textarea id={`${section.key}-${f.key}`} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder} rows={2} className={`${inputCls} resize-none`} />
            ) : f.type === 'qa_list' ? (
              <QaListEditor value={data[f.key]} onChange={v => set(f.key, v)} idPrefix={`${section.key}-${f.key}`} />
            ) : f.type === 'text_list' ? (
              <TextListEditor value={data[f.key]} onChange={v => set(f.key, v)} itemLabel={f.itemLabel} idPrefix={`${section.key}-${f.key}`} />
            ) : f.type === 'image_list' ? (
              <>
                <label className={labelCls}>{f.label}</label>
                <ImageListEditor value={data[f.key]} onChange={v => set(f.key, v)} folder={f.folder || section.key} />
              </>
            ) : (
              <input id={`${section.key}-${f.key}`} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder} className={inputCls} />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 px-5 pb-5">
        <button type="button" onClick={handleSave} disabled={saving || !dirty}
          className="px-5 py-2.5 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : dirty ? 'Save section' : 'Saved'}
        </button>
        <button type="button" onClick={handleRestore} title="Reset the fields below to the original site copy"
          className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-xert-steel/30 font-body text-[10px] uppercase tracking-wider text-xert-concrete/50 hover:border-xert-steel hover:text-xert-offwhite transition-colors">
          <RotateCcw className="w-3 h-3" /> Restore original copy
        </button>
        {dirty && (
          <button type="button" onClick={handleDiscard}
            className="px-3 py-2.5 border border-xert-red/30 font-body text-[10px] uppercase tracking-wider text-xert-red/70 hover:border-xert-red hover:text-xert-red transition-colors">
            Discard changes
          </button>
        )}
        {dirty && <span className="font-body text-xs ml-auto" style={{ color: '#7BA7BC' }}>Unsaved changes</span>}
        {!dirty && savedAt && <span className="font-body text-xs text-green-400 ml-auto">Live ✓</span>}
      </div>
    </div>
  );
}

export default function ContentManager({ onDirtyChange = NOOP }) {
  const { user } = useSupabaseAuth();
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dirtySections, setDirtySections] = useState(() => new Set());

  const handleDirtyChange = React.useCallback((sectionKey, dirty) => {
    setDirtySections(current => {
      const next = new Set(current);
      if (dirty) next.add(sectionKey);
      else next.delete(sectionKey);
      if (next.size === current.size && [...next].every(key => current.has(key))) return current;
      return next;
    });
  }, []);

  useEffect(() => {
    onDirtyChange(dirtySections.size > 0);
  }, [dirtySections, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const load = async () => {
    setLoadError('');
    try {
      const rows = await getAllSiteContent();
      setContent(Object.fromEntries(rows.map(r => [r.key, r])));
    } catch (error) {
      setLoadError(error.message);
      toast({ title: 'Could not load content', description: error.message, variant: 'destructive' });
    }
  };
  useEffect(() => { load(); }, []);

  if (content === null) {
    if (loadError) return <div className="p-6"><AdminLoadError message={loadError} onRetry={load} /></div>;
    return <div className="p-6 space-y-4">{[1, 2].map(i => <div key={i} className="h-48 animate-pulse" style={{ backgroundColor: 'rgba(50,72,90,0.3)' }} />)}</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <Image className="w-4 h-4" style={{ color: '#7BA7BC' }} />
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Site Content</h2>
      </div>
      <p className="font-body text-xs text-xert-concrete/40 mb-6 max-w-2xl">
        Edit the words and photos on the public site. Empty fields fall back to the built-in copy, so you can&rsquo;t
        break anything. Changes go live as soon as visitors refresh.
      </p>
      {dirtySections.size > 0 && (
        <div className="mb-6 px-4 py-3 border border-xert-steel/40 bg-xert-steel/10 font-body text-xs text-xert-pale" role="status">
          {dirtySections.size} section{dirtySections.size === 1 ? '' : 's'} with unsaved changes. Drafts are kept on this device until saved or discarded.
        </div>
      )}
      <div className="space-y-6">
        {SECTIONS.map(s => (
          <SectionEditor
            key={s.key}
            section={s}
            initial={content[s.key]?.data}
            expectedUpdatedAt={content[s.key]?.updated_at}
            onSaved={load}
            onDirtyChange={handleDirtyChange}
            userId={user?.id}
          />
        ))}
      </div>
    </div>
  );
}
