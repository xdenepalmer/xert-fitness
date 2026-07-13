import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { requestHeader, requestJson, sendJson } from './http.js';

// Vercel serverless function using the default Node request/response signature.
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

export function resolveCheckoutReturnURLs(origin, returnTarget = 'web') {
  if (returnTarget === 'ios') {
    return {
      success: `${origin}/checkout-return?status=success`,
      cancel: `${origin}/checkout-return?status=cancelled`,
    };
  }
  if (returnTarget === 'web') {
    return {
      success: `${origin}/account?purchase=success`,
      cancel: `${origin}/booking?purchase=cancelled`,
    };
  }
  throw new Error('Unsupported checkout return target.');
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

/**
 * A stored Stripe Price ID is an optional operational shortcut, not a second
 * source of truth. Refuse checkout when it would charge a different amount or
 * currency than the pack the member selected in XERT.
 */
export function assertStripePriceMatchesProduct(product, stripePrice) {
  if (
    !stripePrice ||
    stripePrice.deleted === true ||
    stripePrice.id !== product?.stripe_price_id ||
    stripePrice.active !== true ||
    stripePrice.type !== 'one_time' ||
    stripePrice.unit_amount !== product?.price_cents ||
    String(stripePrice.currency || '').toLowerCase() !== String(product?.currency || '').toLowerCase()
  ) {
    throw new Error('Stripe price does not match the product configuration.');
  }
}

export function pendingOrderForCheckout(checkout, user, product) {
  if (!checkout?.id || !user?.id || !product?.id) {
    throw new Error('Pending checkout identity is incomplete.');
  }
  const amountCents = checkout.amount_total ?? product.price_cents;
  const currency = String(checkout.currency || product.currency || 'aud').toLowerCase();
  if (
    !Number.isSafeInteger(amountCents)
    || amountCents !== product.price_cents
    || currency !== String(product.currency || 'aud').toLowerCase()
  ) {
    throw new Error('Pending checkout amount does not match the product.');
  }
  return {
    user_id: user.id,
    product_id: product.id,
    email: user.email || null,
    amount_cents: amountCents,
    currency,
    status: 'pending',
    stripe_checkout_session_id: checkout.id,
    stripe_payment_intent_id:
      typeof checkout.payment_intent === 'string'
        ? checkout.payment_intent
        : checkout.payment_intent?.id || null,
  };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe is not configured.' }, 500);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const authHeader = requestHeader(request, 'authorization');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ error: 'Not authenticated.' }, 401);

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Invalid or expired session.' }, 401);

    const { product_slug, return_target = 'web' } = await requestJson(request);
    if (!product_slug) return json({ error: 'Missing product.' }, 400);
    let returnURLs;
    try {
      returnURLs = resolveCheckoutReturnURLs(
        resolveCheckoutOrigin(request.url, process.env.APP_BASE_URL || ''),
        return_target
      );
    } catch (error) {
      return json({ error: error.message }, 400);
    }

    // Price comes from the DB (authoritative) — never trust a client-supplied amount.
    const { data: product, error: prodErr } = await admin
      .from('products')
      .select('*')
      .eq('slug', product_slug)
      .eq('active', true)
      .single();
    if (prodErr || !product) return json({ error: 'Unknown product.' }, 400);
    assertCheckoutProduct(product);

    let lineItem;
    if (product.stripe_price_id) {
      const stripePrice = await stripe.prices.retrieve(product.stripe_price_id);
      assertStripePriceMatchesProduct(product, stripePrice);
      lineItem = { price: stripePrice.id, quantity: 1 };
    } else {
      lineItem = {
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
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [lineItem],
      customer_email: user.email,
      client_reference_id: user.id,
      success_url: returnURLs.success,
      cancel_url: returnURLs.cancel,
      metadata: {
        user_id: user.id,
        product_id: product.id,
        product_slug: product.slug,
        sessions_count: String(product.sessions_count),
        validity_days: String(product.validity_days),
        return_target,
      },
    });

    try {
      const { error: pendingOrderError } = await admin
        .from('orders')
        .upsert(pendingOrderForCheckout(session, user, product), {
          onConflict: 'stripe_checkout_session_id',
        });
      if (pendingOrderError) throw pendingOrderError;
    } catch {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      throw new Error('Checkout could not be recorded. No payment was taken; please try again.');
    }

    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message || 'Checkout failed.' }, 500);
  }
}
