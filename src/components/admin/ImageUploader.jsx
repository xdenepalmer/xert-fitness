import React, { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const MAX_MB = 5;

/**
 * Uploads an image to the public `site-images` bucket and returns its public
 * URL via onChange. Also accepts a pasted URL as a fallback.
 */
export default function ImageUploader({ value, onChange, folder = 'misc', label = 'Photo' }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`Image must be under ${MAX_MB}MB.`); return; }

    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('site-images').getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setError(e.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <p className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="w-20 h-24 shrink-0 border border-xert-steel/30 bg-xert-charcoal overflow-hidden flex items-center justify-center">
          {value ? (
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <span className="font-body text-[10px] text-xert-concrete/30 uppercase text-center px-1">No photo</span>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-4 py-2 border border-xert-steel/40 font-body text-xs text-xert-concrete/70 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-50">
              {uploading ? 'Uploading…' : value ? 'Replace photo' : 'Upload photo'}
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')}
                className="px-4 py-2 border border-xert-red/30 font-body text-xs text-xert-red/60 uppercase tracking-wider hover:border-xert-red/60 transition-colors">
                Remove
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" aria-label={`Upload ${label.toLowerCase()}`} className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />

          {/* URL fallback */}
          <label className="sr-only" htmlFor={`image-url-${folder}`}>{label} URL</label>
          <input id={`image-url-${folder}`} value={value || ''} onChange={e => onChange(e.target.value)}
            placeholder="…or paste an image URL"
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-xs text-xert-offwhite focus:outline-none focus:border-xert-red" />
          {error && <p className="font-body text-xs text-xert-red">{error}</p>}
          <p className="font-body text-[10px] text-xert-concrete/30">JPG/PNG up to {MAX_MB}MB. Portrait photos look best.</p>
        </div>
      </div>
    </div>
  );
}
