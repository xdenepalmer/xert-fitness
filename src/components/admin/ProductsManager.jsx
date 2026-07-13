import React, { useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { X } from 'lucide-react';
import { createProduct, getAllProducts, updateProduct } from '@/lib/adminData';
import { normalizeProductAdminInput, normalizeProductCreateInput, productStripeTransitionError } from '@/lib/products';
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
    currency: product.currency || 'aud',
    sort_order: product.sort_order ?? 0,
    featured: product.featured,
    active: product.active,
    stripe_price_id: product.stripe_price_id || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  let transitionError = '';
  try {
    transitionError = productStripeTransitionError(product, normalizeProductAdminInput(form));
  } catch {
    // Field-level validation is reported when Save is pressed.
  }

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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`product-${product.id}-price`} className={labelCls}>Price (AUD)</label>
          <input id={`product-${product.id}-price`} inputMode="decimal" value={form.price_dollars} onChange={e => set('price_dollars', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-currency`} className={labelCls}>Currency</label>
          <input id={`product-${product.id}-currency`} maxLength={3} value={form.currency} onChange={e => set('currency', e.target.value.toLowerCase())} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-order`} className={labelCls}>Display order</label>
          <input id={`product-${product.id}-order`} type="number" min="0" step="1" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} className={inputCls} />
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
        {transitionError && <p role="alert" className="mt-2 font-body text-xs text-xert-orange">{transitionError}</p>}
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
        <button onClick={handleSave} disabled={saving || Boolean(transitionError)}
          className="ml-auto px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

const emptyProduct = () => ({
  slug: '', name: '', description: '', price_dollars: '', sessions_count: 1,
  validity_days: 28, currency: 'aud', sort_order: 0, featured: false,
  active: false, stripe_price_id: '',
});

function NewProductDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  const save = async () => {
    let product;
    try {
      product = normalizeProductCreateInput(form);
    } catch (error) {
      toast({ title: 'Check this pack', description: error.message, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createProduct(product);
      await onCreated();
      toast({ title: 'Session pack created', description: `${product.name} is ready in the catalogue.` });
      onClose();
    } catch (error) {
      toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="new-product-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-xert-ink border border-xert-steel/20">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 p-5 bg-xert-ink border-b border-xert-steel/20">
          <h3 id="new-product-title" className="font-display text-xl text-xert-offwhite uppercase">New Session Pack</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close new session pack" title="Close" className="min-w-11 min-h-11 inline-flex items-center justify-center text-xert-concrete/50 disabled:opacity-40"><X className="w-5 h-5" /></button>
        </header>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label htmlFor="new-product-name" className={labelCls}>Name</label><input id="new-product-name" autoFocus value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} /></div>
            <div><label htmlFor="new-product-slug" className={labelCls}>Slug</label><input id="new-product-slug" value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase())} placeholder="seasonal-8" className={inputCls} /></div>
          </div>
          <div><label htmlFor="new-product-description" className={labelCls}>Description</label><textarea id="new-product-description" rows={2} value={form.description} onChange={e => set('description', e.target.value)} className={`${inputCls} resize-none`} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div><label htmlFor="new-product-price" className={labelCls}>Price</label><input id="new-product-price" inputMode="decimal" value={form.price_dollars} onChange={e => set('price_dollars', e.target.value)} className={inputCls} /></div>
            <div><label htmlFor="new-product-currency" className={labelCls}>Currency</label><input id="new-product-currency" maxLength={3} value={form.currency} onChange={e => set('currency', e.target.value.toLowerCase())} className={inputCls} /></div>
            <div><label htmlFor="new-product-sessions" className={labelCls}>Sessions</label><input id="new-product-sessions" type="number" min="1" value={form.sessions_count} onChange={e => set('sessions_count', e.target.value)} className={inputCls} /></div>
            <div><label htmlFor="new-product-validity" className={labelCls}>Validity</label><input id="new-product-validity" type="number" min="1" value={form.validity_days} onChange={e => set('validity_days', e.target.value)} className={inputCls} /></div>
            <div><label htmlFor="new-product-order" className={labelCls}>Order</label><input id="new-product-order" type="number" min="0" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} className={inputCls} /></div>
          </div>
          <div><label htmlFor="new-product-stripe" className={labelCls}>Stripe Price ID (optional)</label><input id="new-product-stripe" value={form.stripe_price_id} onChange={e => set('stripe_price_id', e.target.value)} placeholder="price_..." className={inputCls} /></div>
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-11 items-center gap-2 font-body text-sm text-xert-concrete/80"><input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} /> Featured</label>
            <label className="flex min-h-11 items-center gap-2 font-body text-sm text-xert-concrete/80"><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} /> Active and purchasable</label>
          </div>
          <p className="font-body text-xs text-xert-concrete/45">New packs start inactive unless explicitly enabled. The slug becomes the permanent checkout identifier.</p>
        </div>
        <footer className="flex gap-3 p-5 border-t border-xert-steel/20">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 min-h-11 border border-xert-steel/40 font-display text-sm uppercase text-xert-concrete/70 disabled:opacity-40">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="flex-1 min-h-11 bg-xert-red text-white font-display text-sm uppercase disabled:opacity-40">{saving ? 'Creating...' : 'Create pack'}</button>
        </footer>
      </div>
    </div>
  );
}

export default function ProductsManager({ initialAction, onIntentHandled }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
  useEffect(() => {
    if (initialAction !== 'create') return;
    setShowCreate(true);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Session Packs</h2>
        <button type="button" onClick={() => setShowCreate(true)} className="min-h-11 px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase">+ Add Pack</button>
      </div>
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
      {showCreate && <NewProductDialog onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}
