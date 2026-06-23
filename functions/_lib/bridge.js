const textEncoder = new TextEncoder();

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

export function decodePayload(encodedPayload) {
  if (!encodedPayload || encodedPayload.length > 8000) {
    throw new Error('Invalid payload.');
  }

  const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  const payload = JSON.parse(text);

  if (payload.version !== 1 || payload.source !== 'meptides_woo') {
    throw new Error('Unsupported payment payload.');
  }

  if (!payload.order_id || !payload.order_key || !payload.amount || !payload.currency) {
    throw new Error('Payment payload is incomplete.');
  }

  return payload;
}

export async function hmacHex(message, secret) {
  if (!secret) {
    throw new Error('Missing bridge secret.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

export async function verifyPayload(encodedPayload, signature, env) {
  const expected = await hmacHex(encodedPayload, env.MEPTIDES_BRIDGE_SHARED_SECRET);
  if (!timingSafeEqual(expected, signature)) {
    throw new Error('Invalid payment link signature.');
  }

  return decodePayload(encodedPayload);
}

export function normalizeCurrency(currency) {
  return String(currency || 'cad').toLowerCase();
}

export function stripeAuthHeaders(env, extra = {}) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY.');
  }

  return {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    ...extra
  };
}

export async function createPaymentIntent(payload, env) {
  const body = new URLSearchParams();
  body.set('amount', String(payload.amount));
  body.set('currency', normalizeCurrency(payload.currency));
  body.set('automatic_payment_methods[enabled]', 'true');
  body.set('description', `Meptides order #${payload.order_id}`);

  if (payload.email) {
    body.set('receipt_email', payload.email);
  }

  body.set('metadata[source]', 'meptides_woo');
  body.set('metadata[woo_order_id]', String(payload.order_id));
  body.set('metadata[woo_order_key]', String(payload.order_key));
  body.set('metadata[amount]', String(payload.amount));
  body.set('metadata[currency]', normalizeCurrency(payload.currency));

  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: stripeAuthHeaders(env, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `meptides-order-${payload.order_id}-${payload.order_key}`
    }),
    body
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Stripe could not create the payment.');
  }

  return data;
}

export async function retrievePaymentIntent(paymentIntent, env) {
  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntent)}`, {
    headers: stripeAuthHeaders(env)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Stripe could not retrieve the payment.');
  }

  return data;
}

export async function notifyWoo(payload, paymentIntent, env) {
  if (!env.WOO_BRIDGE_COMPLETE_URL) {
    throw new Error('Missing WOO_BRIDGE_COMPLETE_URL.');
  }

  const status = paymentIntent.status;
  const signed = [
    payload.order_id,
    payload.order_key,
    payload.amount,
    normalizeCurrency(payload.currency),
    paymentIntent.id,
    status
  ].join('|');
  const signature = await hmacHex(signed, env.MEPTIDES_BRIDGE_SHARED_SECRET);

  const response = await fetch(env.WOO_BRIDGE_COMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: payload.order_id,
      order_key: payload.order_key,
      amount: payload.amount,
      currency: normalizeCurrency(payload.currency),
      payment_intent: paymentIntent.id,
      status,
      signature
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'WooCommerce could not be updated.');
  }

  return data;
}
