import { createPaymentIntent, json, verifyPayload } from '../_lib/bridge.js';

export async function onRequestPost({ request, env }) {
  try {
    const { payload: encodedPayload, signature } = await request.json();
    const payload = await verifyPayload(encodedPayload, signature, env);
    const intent = await createPaymentIntent(payload, env);

    if (!env.STRIPE_PUBLISHABLE_KEY) {
      return json({ error: 'Missing STRIPE_PUBLISHABLE_KEY.' }, { status: 500 });
    }

    return json({
      clientSecret: intent.client_secret,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY
    });
  } catch (error) {
    return json({ error: error.message || 'Unable to create payment.' }, { status: 400 });
  }
}
