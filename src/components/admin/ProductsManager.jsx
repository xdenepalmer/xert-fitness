import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { createProduct, getAllProducts, provisionProductPrice, updateProduct } from '@/lib/adminData';
import { normalizeProductAdminInput, normalizeProductCreateInput, productStripeReadiness, productStripeTransitionError } from '@/lib/products';
import AdminLoadError from './AdminLoadError';
import AdminConfirmDialog from './AdminConfirmDialog';

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';
const NOOP = (_key, _dirty) => {};

function productEditorForm(product) {
  return {
    name: product.name || '',
    description: product.description || '',
    price_dollars: (Number(product.price_cents || 0) / 100).toFixed(2),
    sessions_count: String(product.sessions_count ?? ''),
    validity_days: String(product.validity_days ?? ''),
    currency: product.currency || 'aud',
    sort_order: String(product.sort_order ?? 0),
    featured: Boolean(product.featured),
    active: Boolean(product.active),
    stripe_price_id: product.stripe_price_id || '',
  };
}

function ProductCard({ product, onSaved, onDirtyChange }) {
  const baseline = useMemo(() => productEditorForm(product), [product]);
  const [form, setForm] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [confirmProvision, setConfirmProvision] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const dirty = Object.keys(baseline).some(key => form[key] !== baseline[key]);

  useEffect(() => {
    onDirtyChange(product.id, dirty);
  }, [dirty, onDirtyChange, product.id]);

  useEffect(() => () => onDirtyChange(product.id, false), [onDirtyChange, product.id]);
  let transitionError = '';
  const hasStripePrice = /^price_[A-Za-z0-9]+$/.test(form.stripe_price_id.trim());
  const activationError = form.active && !hasStripePrice
    ? 'Enter a valid Stripe Price ID before making this pack active and purchasable.'
    : '';
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
    if (activationError) {
      toast({ title: 'Pack is not ready for sale', description: activationError, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const saved = await updateProduct(product.id, updates, product.updated_at);
      onSaved(saved);
      toast({
        title: updates.active ? 'Session pack verified and saved' : 'Session pack saved',
        description: updates.active
          ? `${updates.name} matches Stripe and is ready for checkout.`
          : `${updates.name} is up to date.`,
      });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const provisionPrice = async () => {
    setProvisioning(true);
    try {
      const saved = await provisionProductPrice(product.id, product.updated_at, 'CREATE STRIPE PRICE');
      onSaved(saved);
      setConfirmProvision(false);
      toast({
        title: 'Stripe Price linked',
        description: `${saved.name} remains private. Review it, then activate it separately when ready.`,
      });
    } catch (error) {
      toast({ title: 'Stripe Price not linked', description: error.message, variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="bg-xert-ink border border-xert-steel/20 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-xert-offwhite uppercase">{product.name}</h3>
          {dirty && <p role="status" className="mt-1 font-body text-xs text-xert-steel">Unsaved changes</p>}
        </div>
        <div className="flex items-center gap-2">
          {form.featured && <span className="font-body text-xs border border-xert-orange/40 text-xert-orange px-2 py-0.5 uppercase">Featured</span>}
          {!form.active && <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/40 px-2 py-0.5 uppercase">Inactive</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`product-${product.id}-price`} className={labelCls}>Price (AUD)</label>
          <input id={`product-${product.id}-price`} inputMode="decimal" value={form.price_dollars} onChange={e => set('price_dollars', e.target.value)} disabled={provisioning} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-currency`} className={labelCls}>Currency</label>
          <input id={`product-${product.id}-currency`} maxLength={3} value={form.currency} onChange={e => set('currency', e.target.value.toLowerCase())} disabled={provisioning} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-order`} className={labelCls}>Display order</label>
          <input id={`product-${product.id}-order`} type="number" min="0" step="1" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} disabled={provisioning} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-sessions`} className={labelCls}>Sessions</label>
          <input id={`product-${product.id}-sessions`} type="number" min="1" step="1" value={form.sessions_count} onChange={e => set('sessions_count', e.target.value)} disabled={provisioning} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-validity`} className={labelCls}>Validity (days)</label>
          <input id={`product-${product.id}-validity`} type="number" min="1" step="1" value={form.validity_days} onChange={e => set('validity_days', e.target.value)} disabled={provisioning} className={inputCls} />
        </div>
        <div>
          <label htmlFor={`product-${product.id}-name`} className={labelCls}>Name</label>
          <input id={`product-${product.id}-name`} value={form.name} onChange={e => set('name', e.target.value)} disabled={provisioning} className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor={`product-${product.id}-description`} className={labelCls}>Description</label>
        <textarea id={`product-${product.id}-description`} value={form.description} onChange={e => set('description', e.target.value)} disabled={provisioning} rows={2} className={`${inputCls} resize-none`} />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <label htmlFor={`product-${product.id}-stripe`} className={`${labelCls} mb-0`}>Stripe Price ID (required for live checkout)</label>
          {form.active && (
            <span className={`inline-flex items-center gap-1 font-body text-xs ${hasStripePrice && !dirty ? 'text-green-400' : 'text-xert-orange'}`}>
              {hasStripePrice && !dirty ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {hasStripePrice && !dirty ? 'Verified on last save' : 'Verification required'}
            </span>
          )}
        </div>
        <input id={`product-${product.id}-stripe`} value={form.stripe_price_id} onChange={e => set('stripe_price_id', e.target.value)} disabled={provisioning} placeholder="price_..." className={inputCls} />
        {transitionError && <p role="alert" className="mt-2 font-body text-xs text-xert-orange">{transitionError}</p>}
        {activationError && <p role="alert" className="mt-2 font-body text-xs text-xert-orange">{activationError}</p>}
        {hasStripePrice && <p className="mt-2 font-body text-xs text-xert-concrete/45">Saving an active pack verifies amount, currency, credits, validity, identity and Stripe mode. Checkout verifies them again before every charge.</p>}
        {!product.active && !product.stripe_price_id && !dirty && (
          <button type="button" onClick={() => setConfirmProvision(true)} disabled={provisioning || saving}
            className="mt-3 min-h-11 w-full border border-xert-steel/40 px-4 font-display text-sm uppercase text-xert-steel disabled:opacity-40">
            {provisioning ? 'Preparing Stripe Price...' : 'Create & link exact Stripe Price'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} disabled={provisioning} className="peer sr-only" />
          <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center transition-all peer-checked:border-xert-orange peer-checked:bg-xert-orange peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">
            {form.featured && <span className="text-xert-navy text-xs">&#10003;</span>}
          </span>
          <span className="font-body text-sm text-xert-concrete/80">Featured (&ldquo;Most Popular&rdquo;)</span>
        </label>
        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} disabled={provisioning} className="peer sr-only" />
          <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center transition-all peer-checked:border-green-500 peer-checked:bg-green-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">
            {form.active && <span className="text-white text-xs">&#10003;</span>}
          </span>
          <span className="font-body text-sm text-xert-concrete/80">Active (purchasable)</span>
        </label>
        <button onClick={handleSave} disabled={saving || provisioning || !dirty || Boolean(transitionError) || Boolean(activationError)}
          className="ml-auto px-5 py-2.5 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <AdminConfirmDialog
        open={confirmProvision}
        onOpenChange={setConfirmProvision}
        title="Create this exact Stripe Price?"
        description={`${form.name} · ${form.price_dollars} ${form.currency.toUpperCase()} · ${form.sessions_count} sessions · ${form.validity_days} days`}
        warning="XERT will create or reuse the exact one-time Stripe Price and link it to this draft. The pack stays private until you activate it separately."
        cancelLabel="Keep private"
        confirmLabel="Create Stripe Price"
        onConfirm={() => void provisionPrice()}
        busy={provisioning}
      />
    </div>
  );
}

const emptyProduct = () => ({
  slug: '', name: '', description: '', price_dollars: '', sessions_count: 1,
  validity_days: 28, currency: 'aud', sort_order: 0, featured: false,
  active: false, stripe_price_id: '',
});

function NewProductDialog({ onClose, onCreated, onDirtyChange }) {
  const baseline = useMemo(emptyProduct, []);
  const [form, setForm] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const dirty = Object.keys(baseline).some(key => form[key] !== baseline[key]);

  useEffect(() => {
    onDirtyChange('create', dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange('create', false), [onDirtyChange]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [dirty, onClose, saving]);

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [requestClose]);

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
      const created = await createProduct(product);
      onCreated(created);
      toast({ title: 'Session pack created', description: `${product.name} is ready in the catalogue.` });
      onClose();
    } catch (error) {
      toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-product-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-xert-ink border border-xert-steel/20">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 p-5 bg-xert-ink border-b border-xert-steel/20">
          <div>
            <h3 id="new-product-title" className="font-display text-xl text-xert-offwhite uppercase">New Session Pack</h3>
            {dirty && <p role="status" className="mt-1 font-body text-xs text-xert-steel">Unsaved changes</p>}
          </div>
          <button type="button" onClick={requestClose} disabled={saving} aria-label="Close new session pack" title="Close" className="min-w-11 min-h-11 inline-flex items-center justify-center text-xert-concrete/50 disabled:opacity-40"><X className="w-5 h-5" /></button>
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
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-11 items-center gap-2 font-body text-sm text-xert-concrete/80"><input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} /> Featured</label>
          </div>
          <p className="font-body text-xs text-xert-concrete/45">New packs are always created as private drafts with no Stripe link. The slug becomes the permanent checkout identifier. Add and verify the Stripe Price ID before making the saved pack active.</p>
        </div>
        <footer className="flex gap-3 p-5 border-t border-xert-steel/20">
          <button type="button" onClick={requestClose} disabled={saving} className="flex-1 min-h-11 border border-xert-steel/40 font-display text-sm uppercase text-xert-concrete/70 disabled:opacity-40">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="flex-1 min-h-11 bg-xert-steel text-xert-navy font-display text-sm uppercase disabled:opacity-40">{saving ? 'Creating...' : 'Create pack'}</button>
        </footer>
      </div>
      <AdminConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard session pack draft?"
        description="This new session pack has details that have not been saved."
        warning="Closing now permanently discards the draft."
        cancelLabel="Keep editing"
        confirmLabel="Discard draft"
        onConfirm={onClose}
        busy={saving}
      />
    </div>
  );
}

export default function ProductsManager({ initialAction, onIntentHandled, onDirtyChange = NOOP }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [dirtyEditors, setDirtyEditors] = useState(() => new Set());
  const stripeReadiness = useMemo(() => productStripeReadiness(products), [products]);

  const acceptSavedProduct = useCallback(saved => {
    if (saved?.id) {
      setProducts(current => {
        const index = current.findIndex(product => product.id === saved.id);
        if (index === -1) return [...current, saved].sort((left, right) => left.sort_order - right.sort_order);
        const next = [...current];
        next[index] = saved;
        return next.sort((left, right) => left.sort_order - right.sort_order);
      });
      setLoadError('');
    }
    getAllProducts()
      .then(setProducts)
      .catch(error => toast({
        title: 'Pack saved; refresh needed',
        description: `The change is safe, but the catalogue could not refresh: ${error.message}`,
        variant: 'destructive',
      }));
  }, []);

  const handleDirtyChange = useCallback((key, dirty) => {
    setDirtyEditors(current => {
      const next = new Set(current);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  useEffect(() => {
    onDirtyChange(dirtyEditors.size > 0);
  }, [dirtyEditors, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

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
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Session Packs &amp; Pricing</h2>
        <button type="button" onClick={() => setShowCreate(true)} className="min-h-11 px-5 py-2.5 bg-xert-steel text-xert-navy font-display text-sm uppercase">+ Add Pack</button>
      </div>
      <p className="font-body text-xs text-xert-concrete/40 mb-6 max-w-2xl">
        XERT currently sells one-off session packs rather than recurring subscriptions. Price and credit changes apply to new purchases only; existing credits keep their original terms.
      </p>
      {!loading && !loadError && (
        <div role="status" className={`mb-6 border-l-4 px-4 py-3 ${stripeReadiness.readyForLive ? 'border-green-500 bg-green-500/10' : 'border-xert-orange bg-xert-orange/10'}`}>
          <div className="flex items-start gap-3">
            {stripeReadiness.readyForLive
              ? <CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-green-400" />
              : <AlertTriangle className="mt-0.5 w-5 h-5 shrink-0 text-xert-orange" />}
            <div>
              <p className="font-display text-sm uppercase text-xert-offwhite">Live Stripe readiness</p>
              <p className="mt-1 font-body text-xs text-xert-concrete/70">
                {stripeReadiness.activeCount === 0
                  ? 'No active packs. Activate at least one pack and attach its live Stripe Price ID before launch.'
                  : stripeReadiness.readyForLive
                    ? `All ${stripeReadiness.activeCount} active pack${stripeReadiness.activeCount === 1 ? '' : 's'} have linked Stripe Price IDs. Operations Health and checkout re-verify their full terms.`
                    : `${stripeReadiness.missingCount} of ${stripeReadiness.activeCount} active pack${stripeReadiness.activeCount === 1 ? '' : 's'} block live checkout: ${stripeReadiness.missingSlugs.join(', ')}.`}
              </p>
              {!stripeReadiness.readyForLive && stripeReadiness.activeCount > 0 && (
                <p className="mt-1 font-body text-xs text-xert-concrete/45">Test checkout may use dynamic prices. Live checkout intentionally refuses packs without a live price_ ID.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-xert-ink animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {products.length === 0
            ? <p className="font-body text-sm text-xert-concrete/60">No session packs have been configured.</p>
            : products.map(p => <ProductCard key={`${p.id}:${p.updated_at || ''}`} product={p} onSaved={acceptSavedProduct} onDirtyChange={handleDirtyChange} />)}
        </div>
      )}
      {showCreate && <NewProductDialog onClose={() => setShowCreate(false)} onCreated={acceptSavedProduct} onDirtyChange={handleDirtyChange} />}
    </div>
  );
}
