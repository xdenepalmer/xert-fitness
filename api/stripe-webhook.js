import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Vercel serverless function (Web Handler signature).
// Stripe calls this after a successful checkout. We verify the signature,
// record the paid order, and grant the member their session credits.
//
// The Web Handler signature gives us the raw request body via request.text(),
// which is required for Stripe signature verification.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    return new Response('Stripe is not configured.', { status: 500 });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response('Supabase is not configured.', { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${e.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const md = s.metadata || {};

    try {
      // Idempotency: Stripe may deliver an event more than once.
      const { data: existing } = await admin
        .from('orders')
        .select('id')
        .eq('stripe_checkout_session_id', s.id)
        .maybeSingle();

      if (!existing) {
        const { data: order, error: orderErr } = await admin
          .from('orders')
          .insert({
            user_id: md.user_id || null,
            product_id: md.product_id || null,
            email: s.customer_details?.email || s.customer_email || null,
            amount_cents: s.amount_total,
            currency: s.currency,
            status: 'paid',
            stripe_checkout_session_id: s.id,
            stripe_payment_intent_id:
              typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || null,
            paid_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (orderErr) throw orderErr;

        if (md.user_id) {
          const sessions = parseInt(md.sessions_count || '0', 10);
          const validity = parseInt(md.validity_days || '0', 10);
          const expiresAt =
            validity > 0 ? new Date(Date.now() + validity * 86400000).toISOString() : null;

          const { error: creditErr } = await admin.from('credit_batches').insert({
            user_id: md.user_id,
            product_id: md.product_id || null,
            order_id: order.id,
            total: sessions,
            remaining: sessions,
            expires_at: expiresAt,
          });
          if (creditErr) throw creditErr;
        }
      }
    } catch (e) {
      // 500 makes Stripe retry delivery.
      return new Response(`Handler error: ${e.message}`, { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
