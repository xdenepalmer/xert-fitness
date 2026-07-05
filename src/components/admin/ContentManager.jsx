import React, { useEffect, useState } from 'react';
import { getAllSiteContent, saveSiteContent } from '@/lib/adminData';
import { clearSiteContentCache } from '@/lib/siteContent';

// Schema-driven CMS editor. Add a section here + a useSiteContent() call in the
// matching public component and it becomes editable — no other wiring needed.
const SECTIONS = [
  {
    key: 'hero',
    title: 'Homepage Hero',
    description: 'The first thing every visitor sees.',
    fields: [
      { key: 'headline', label: 'Headline', type: 'text', placeholder: 'Beat Your Best.' },
      { key: 'subheading', label: 'Subheading', type: 'textarea', placeholder: 'Structured functional fitness coaching…' },
      { key: 'supporting', label: 'Supporting line', type: 'textarea', placeholder: 'Semi-private training in Kingaroy…' },
    ],
  },
  {
    key: 'contact',
    title: 'Contact Details',
    description: 'Used on the Contact page and site footer.',
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
    description: 'Questions shown on the homepage. Leave empty to use the built-in defaults.',
    fields: [
      { key: 'items', label: 'Questions & answers', type: 'qa_list' },
    ],
  },
];

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';

function QaListEditor({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const update = (i, field, v) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, [field]: v } : it));
    onChange(next);
  };
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
            <span className="font-body text-xs text-xert-concrete/40 uppercase">Q{i + 1}</span>
            <div className="flex gap-1">
              <button onClick={() => move(i, -1)} className="px-2 py-0.5 border border-xert-steel/30 text-xert-concrete/50 text-xs hover:border-xert-steel">↑</button>
              <button onClick={() => move(i, 1)} className="px-2 py-0.5 border border-xert-steel/30 text-xert-concrete/50 text-xs hover:border-xert-steel">↓</button>
              <button onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="px-2 py-0.5 border border-xert-red/30 text-xert-red/60 text-xs hover:border-xert-red/60">✕</button>
            </div>
          </div>
          <input value={item.q || ''} onChange={e => update(i, 'q', e.target.value)} placeholder="Question" className={inputCls} />
          <textarea value={item.a || ''} onChange={e => update(i, 'a', e.target.value)} placeholder="Answer" rows={2} className={`${inputCls} resize-none`} />
        </div>
      ))}
      <button onClick={() => onChange([...items, { q: '', a: '' }])}
        className="px-4 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase hover:border-xert-steel transition-colors">
        + Add question
      </button>
    </div>
  );
}

function SectionEditor({ section, initial, onSaved }) {
  const [data, setData] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Drop empty strings so public fallbacks kick in rather than rendering ''.
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      await saveSiteContent(section.key, clean);
      clearSiteContentCache();
      setSavedAt(new Date());
      onSaved();
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-xert-ink border border-xert-steel/20 p-5">
      <div className="mb-4">
        <h3 className="font-display text-lg text-xert-offwhite uppercase">{section.title}</h3>
        <p className="font-body text-xs text-xert-concrete/40 mt-0.5">{section.description}</p>
      </div>
      <div className="space-y-4">
        {section.fields.map(f => (
          <div key={f.key}>
            <label className={labelCls}>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder} rows={2} className={`${inputCls} resize-none`} />
            ) : f.type === 'qa_list' ? (
              <QaListEditor value={data[f.key]} onChange={v => set(f.key, v)} />
            ) : (
              <input value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder} className={inputCls} />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-5">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save section'}
        </button>
        {savedAt && <span className="font-body text-xs text-green-400">Saved ✓</span>}
      </div>
    </div>
  );
}

export default function ContentManager() {
  const [content, setContent] = useState(null);

  const load = () => {
    getAllSiteContent()
      .then(rows => setContent(Object.fromEntries(rows.map(r => [r.key, r.data]))))
      .catch(e => { alert(e.message); setContent({}); });
  };
  useEffect(() => { load(); }, []);

  if (content === null) {
    return <div className="p-6 space-y-4">{[1, 2].map(i => <div key={i} className="h-48 bg-xert-ink animate-pulse" />)}</div>;
  }

  return (
    <div className="p-6">
      <h2 className="font-display text-lg text-xert-offwhite uppercase mb-2">Site Content</h2>
      <p className="font-body text-xs text-xert-concrete/40 mb-6 max-w-2xl">
        Edit the words on the public site. Empty fields fall back to the built-in copy, so you can&rsquo;t break anything.
        Changes go live as soon as visitors refresh.
      </p>
      <div className="space-y-6">
        {SECTIONS.map(s => (
          <SectionEditor key={s.key} section={s} initial={content[s.key]} onSaved={load} />
        ))}
      </div>
    </div>
  );
}
