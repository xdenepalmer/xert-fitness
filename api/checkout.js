import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Vercel serverless function (Web Handler signature).
// Creates a Stripe Checkout Session for a session pack, attributed to the
// signed-in member so the webhook can grant their credits after payment.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Stripe return URLs must never come from a request Origin header: browsers
 * and non-browser clients can supply that header themselves. A configured
 * canonical URL wins; otherwise Vercel's request URL keeps the buyer on the
 * deployment that created the Checkout Session.
 */
export function resolveCheckoutOrigin(requestUrl, appBaseUrl = '') {
  const candidate = appBaseUrl.trim() || requestUrl;
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Checkout return URL must use HTTP or HTTPS.');
  }
  return url.origin;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * The product table is the server-side authority for price and credits. Keep
 * this validation here as a deployment-safe backstop while database migrations
 * roll out, so malformed admin data never reaches Stripe or credit fulfilment.
 */
export function assertCheckoutProduct(product) {
  const currency = String(product?.currency || 'aud');
  if (
    !product ||
    !isPositiveInteger(product.price_cents) ||
    !isPositiveInteger(product.sessions_count) ||
    !isPositiveInteger(product.validity_days) ||
    !/^[a-z]{3}$/i.test(currency)
  ) {
    throw new Error('Product configuration is invalid.');
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe is not configured.' }, 500);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ error: 'Not authenticated.' }, 401);

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Invalid or expired session.' }, 401);

    const { product_slug } = await request.json();
    if (!product_slug) return json({ error: 'Missing product.' }, 400);

    // Price comes from the DB (authoritative) — never trust a client-supplied amount.
    const { data: product, error: prodErr } = await admin
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .eq('active', true)
      .single();
    if (prodErr || !product) return json({ error: 'Unknown product.' }, 400);
    assertCheckoutProduct(product);

    const lineItem = product.stripe_price_id
      ? { price: product.stripe_price_id, quantity: 1 }
      : {
          price_data: {
            currency: product.currency.toLowerCase(),
            unit_amount: product.price_cents,
            product_data: {
              name: product.name,
              description: product.description || undefined,
            },
          },
          quantity: 1,
        };

    const origin = resolveCheckoutOrigin(request.url, process.env.APP_BASE_URL || '');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [lineItem],
      customer_email: user.email,
      client_reference_id: user.id,
      success_url: `${origin}/account?purchase=success`,
      cancel_url: `${origin}/booking?purchase=cancelled`,
      metadata: {
        user_id: user.id,
        product_id: product.id,
        product_slug: product.slug,
        sessions_count: String(product.sessions_count),
        validity_days: String(product.validity_days),
      },
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message || 'Checkout failed.' }, 500);
  }
}
