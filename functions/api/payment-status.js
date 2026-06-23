import { json, notifyWoo, retrievePaymentIntent, verifyPayload } from '../_lib/bridge.js';

export async function onRequestPost({ request, env }) {
  try {
    const { paymentIntent, payload: encodedPayload, signature } = await request.json();
    const payload = await verifyPayload(encodedPayload, signature, env);
    const intent = await retrievePaymentIntent(paymentIntent, env);

    if (String(intent.metadata?.woo_order_id) !== String(payload.order_id)) {
      return json({ error: 'Payment does not match this WooCommerce order.' }, { status: 409 });
    }

    if (Number(intent.amount) !== Number(payload.amount) || String(intent.currency) !== String(payload.currency).toLowerCase()) {
      return json({ error: 'Payment amount does not match this WooCommerce order.' }, { status: 409 });
    }

    if (intent.status === 'succeeded') {
      await notifyWoo(payload, intent, env);
    }

    return json({
      status: intent.status,
      successUrl: payload.success_url,
      cancelUrl: payload.cancel_url
    });
  } catch (error) {
    return json({ error: error.message || 'Unable to confirm payment.' }, { status: 400 });
  }
}
