import React, { useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { getAllProducts, updateProduct } from '@/lib/adminData';

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';

function ProductCard({ product, onSaved }) {
  const [form, setForm] = useState({
    name: product.name,
    description: product.description || '',
    price_dollars: (product.price_cents / 100).toFixed(2),
    sessions_count: product.sessions_count,
    validity_days: product.validity_days,
    featured: product.featured,
    active: product.active,
    stripe_price_id: product.stripe_price_id || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    const cents = Math.round(parseFloat(form.price_dollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { toast({ title: 'Invalid price.', variant: 'destructive' }); return; }
    const sessions = Number(form.sessions_count);
    if (!Number.isSafeInteger(sessions) || sessions <= 0) { toast({ title: 'Sessions must be a whole number of at least 1.', variant: 'destructive' }); return; }
    const validityDays = Number(form.validity_days);
    if (!Number.isSafeInteger(validityDays) || validityDays <= 0) { toast({ title: 'Validity must be a whole number of at least 1 day.', variant: 'destructive' }); return; }
    const name = form.name.trim();
    if (!name) { toast({ title: 'A pack name is required.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await updateProduct(product.id, {
        name,
        description: form.description || null,
        price_cents: cents,
        sessions_count: sessions,
        validity_days: validityDays,
        featured: form.featured,
        active: form.active,
        stripe_price_id: form.stripe_price_id.trim() || null,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-xert-ink border border-xert-steel/20 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-xert-offwhite uppercase">{product.name}</h3>
        <div className="flex items-center gap-2">
          {form.featured && <span className="font-body text-xs border border-xert-orange/40 text-xert-orange px-2 py-0.5 uppercase">Featured</span>}
          {!form.active && <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/40 px-2 py-0.5 uppercase">Inactive</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Price (AUD)</label>
          <input value={form.price_dollars} onChange={e => set('price_dollars', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Sessions</label>
          <input type="number" min="1" value={form.sessions_count} onChange={e => set('sessions_count', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Validity (days)</label>
          <input type="number" min="1" value={form.validity_days} onChange={e => set('validity_days', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </div>

      <div>
        <label className={labelCls}>Stripe Price ID (optional — overrides ad-hoc pricing)</label>
        <input value={form.stripe_price_id} onChange={e => set('stripe_price_id', e.target.value)} placeholder="price_…" className={inputCls} />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => set('featured', !form.featured)}
            className={`w-5 h-5 border-2 flex items-center justify-center transition-all ${form.featured ? 'border-xert-orange bg-xert-orange' : 'border-xert-steel/50'}`}>
            {form.featured && <span className="text-xert-navy text-xs">✓</span>}
          </div>
          <span className="font-body text-sm text-xert-concrete/80">Featured (&ldquo;Most Popular&rdquo;)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => set('active', !form.active)}
            className={`w-5 h-5 border-2 flex items-center justify-center transition-all ${form.active ? 'border-green-500 bg-green-500' : 'border-xert-steel/50'}`}>
            {form.active && <span className="text-white text-xs">✓</span>}
          </div>
          <span className="font-body text-sm text-xert-concrete/80">Active (purchasable)</span>
        </label>
        <button onClick={handleSave} disabled={saving}
          className="ml-auto px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getAllProducts().then(d => { setProducts(d); setLoading(false); }).catch(e => { toast({ title: 'Something went wrong', description: e.message, variant: 'destructive' }); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6">
      <h2 className="font-display text-lg text-xert-offwhite uppercase mb-2">Session Packs</h2>
      <p className="font-body text-xs text-xert-concrete/40 mb-6 max-w-2xl">
        Price changes apply to new purchases immediately. Existing credits are unaffected.
      </p>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-xert-ink animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {products.map(p => <ProductCard key={p.id} product={p} onSaved={load} />)}
        </div>
      )}
    </div>
  );
}
