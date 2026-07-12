import React, { useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { getAllProducts, updateProduct } from '@/lib/adminData';
import { normalizeProductAdminInput } from '@/lib/products';
import AdminLoadError from './AdminLoadError';

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
    let updates;
    try {
      updates = normalizeProductAdminInput(form);
    } catch (error) {
      toast({ title: 'Check this pack', description: error.message, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateProduct(product.id, updates);
      await onSaved();
      toast({ title: 'Session pack saved', description: `${updates.name} is up to date.` });
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
          <label htmlFor={`product-${product.id}-price`} className={labelCls}>Price (AUD)</label>
          <input id={`product-${product.id}-price`} inputMode="decimal" value={form.price_dollars} onChange={e => set('price_dollars', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-sessions`} className={labelCls}>Sessions</label>
          <input id={`product-${product.id}-sessions`} type="number" min="1" step="1" value={form.sessions_count} onChange={e => set('sessions_count', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-validity`} className={labelCls}>Validity (days)</label>
          <input id={`product-${product.id}-validity`} type="number" min="1" step="1" value={form.validity_days} onChange={e => set('validity_days', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-name`} className={labelCls}>Name</label>
          <input id={`product-${product.id}-name`} value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor={`product-${product.id}-description`} className={labelCls}>Description</label>
        <textarea id={`product-${product.id}-description`} value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </div>

      <div>
        <label htmlFor={`product-${product.id}-stripe`} className={labelCls}>Stripe Price ID (optional - overrides ad-hoc pricing)</label>
        <input id={`product-${product.id}-stripe`} value={form.stripe_price_id} onChange={e => set('stripe_price_id', e.target.value)} placeholder="price_..." className={inputCls} />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center transition-all peer-checked:border-xert-orange peer-checked:bg-xert-orange peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">
            {form.featured && <span className="text-xert-navy text-xs">&#10003;</span>}
          </span>
          <span className="font-body text-sm text-xert-concrete/80">Featured (&ldquo;Most Popular&rdquo;)</span>
        </label>
        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center transition-all peer-checked:border-green-500 peer-checked:bg-green-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">
            {form.active && <span className="text-white text-xs">&#10003;</span>}
          </span>
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
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProducts(await getAllProducts());
    } catch (error) {
      setLoadError(error.message);
      toast({ title: 'Could not load session packs', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6">
      <h2 className="font-display text-lg text-xert-offwhite uppercase mb-2">Session Packs</h2>
      <p className="font-body text-xs text-xert-concrete/40 mb-6 max-w-2xl">
        Price changes apply to new purchases immediately. Existing credits are unaffected.
      </p>
      {loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-xert-ink animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {products.length === 0
            ? <p className="font-body text-sm text-xert-concrete/60">No session packs have been configured.</p>
            : products.map(p => <ProductCard key={p.id} product={p} onSaved={load} />)}
        </div>
      )}
    </div>
  );
}
