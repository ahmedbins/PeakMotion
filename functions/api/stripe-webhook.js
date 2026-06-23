import { decodePayload, hmacHex, json, notifyWoo, retrievePaymentIntent, timingSafeEqual } from '../_lib/bridge.js';

async function verifyStripeSignature(rawBody, signatureHeader, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET.');
  }

  const parts = String(signatureHeader || '')
    .split(',')
    .map((part) => part.split('='))
    .filter((pair) => pair.length === 2);
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);

  if (!timestamp || signatures.length === 0) {
    throw new Error('Missing Stripe signature.');
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    throw new Error('Expired Stripe signature.');
  }

  const expected = await hmacHex(`${timestamp}.${rawBody}`, env.STRIPE_WEBHOOK_SECRET);
  if (!signatures.some((signature) => timingSafeEqual(expected, signature))) {
    throw new Error('Invalid Stripe signature.');
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const rawBody = await request.text();
    await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), env);

    const event = JSON.parse(rawBody);
    if (event.type !== 'payment_intent.succeeded') {
      return json({ received: true, ignored: event.type });
    }

    const intentId = event.data?.object?.id;
    const intent = await retrievePaymentIntent(intentId, env);
    const metadata = intent.metadata || {};
    const payload = decodePayload(btoa(JSON.stringify({
      version: 1,
      source: 'meptides_woo',
      order_id: Number(metadata.woo_order_id),
      order_key: metadata.woo_order_key,
      amount: Number(metadata.amount),
      currency: metadata.currency,
      success_url: '',
      cancel_url: ''
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));

    await notifyWoo(payload, intent, env);
    return json({ received: true });
  } catch (error) {
    return json({ error: error.message || 'Webhook failed.' }, { status: 400 });
  }
}
