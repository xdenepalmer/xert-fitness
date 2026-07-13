import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { assertCheckoutProduct, assertStripePriceMatchesProduct } from './checkout.js';
import { requestHeader, sendJson } from './http.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function inspectCommerceEnvironment(environment = {}) {
  const missing = [];
  if (!String(environment.STRIPE_SECRET_KEY || '').trim()) missing.push('STRIPE_SECRET_KEY');
  if (!String(environment.STRIPE_WEBHOOK_SECRET || '').trim()) missing.push('STRIPE_WEBHOOK_SECRET');

  try {
    const appBaseUrl = new URL(String(environment.APP_BASE_URL || '').trim());
    if (appBaseUrl.protocol !== 'https:' || !appBaseUrl.hostname) missing.push('APP_BASE_URL');
  } catch {
    missing.push('APP_BASE_URL');
  }

  return { ready: missing.length === 0, missing };
}

function environmentIssues(environmentHealth) {
  return environmentHealth.missing.map(name => ({
    slug: 'server',
    reason: `Missing or invalid server setting: ${name}.`,
  }));
}

export async function inspectCommerceProducts(products, retrieveStripePrice) {
  const issues = [];
  let stripePriceCount = 0;
  let dynamicPriceCount = 0;

  for (const product of products || []) {
    const slug = String(product?.slug || 'unknown-product');
    try {
      assertCheckoutProduct(product);
    } catch {
      issues.push({ slug, reason: 'Supabase product values are invalid.' });
      continue;
    }

    if (!product.stripe_price_id) {
      dynamicPriceCount += 1;
      continue;
    }

    stripePriceCount += 1;
    let stripePrice;
    try {
      stripePrice = await retrieveStripePrice(product.stripe_price_id);
    } catch {
      issues.push({ slug, reason: 'Stripe Price ID could not be loaded.' });
      continue;
    }
    try {
      assertStripePriceMatchesProduct(product, stripePrice);
    } catch {
      issues.push({ slug, reason: 'Stripe amount, currency, type, or active state does not match.' });
    }
  }

  return {
    ready: (products?.length || 0) > 0 && issues.length === 0,
    active_product_count: products?.length || 0,
    stripe_price_count: stripePriceCount,
    dynamic_price_count: dynamicPriceCount,
    issues,
  };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
  if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

  const { data: products, error: productError } = await admin
    .from('products')
    .select('slug,price_cents,currency,sessions_count,validity_days,stripe_price_id')
    .eq('active', true)
    .order('sort_order');
  if (productError) return json({ error: 'Could not load active products.' }, 500);

  const activeProducts = products || [];
  const environment = inspectCommerceEnvironment(process.env);
  if (environment.missing.includes('STRIPE_SECRET_KEY')) {
    return json({
      ready: false,
      active_product_count: activeProducts.length,
      stripe_price_count: activeProducts.filter(product => product.stripe_price_id).length,
      dynamic_price_count: activeProducts.filter(product => !product.stripe_price_id).length,
      issues: environmentIssues(environment),
      environment,
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const productHealth = await inspectCommerceProducts(
    activeProducts,
    priceId => stripe.prices.retrieve(priceId)
  );
  return json({
    ...productHealth,
    ready: productHealth.ready && environment.ready,
    issues: [...productHealth.issues, ...environmentIssues(environment)],
    environment,
  });
}
