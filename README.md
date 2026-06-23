# PeakMotion payment bridge

This repo is hosted on Cloudflare Pages and now includes a Meptides payment bridge at `/payment/`.

## Required Cloudflare Pages environment variables

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
MEPTIDES_BRIDGE_SHARED_SECRET=<same value configured in WooCommerce>
WOO_BRIDGE_COMPLETE_URL=https://shop.meptides.com/wp-json/meptides/v1/stripe-bridge/complete
```

Optional, recommended after creating a Stripe webhook endpoint for `/api/stripe-webhook`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Flow

1. WooCommerce creates the order using the Meptides Stripe Bridge Gateway plugin.
2. Woo redirects the customer to `/payment/?mpb=...&sig=...`.
3. `/api/payment-intent` verifies the signed Woo payload and creates a Stripe PaymentIntent.
4. The page renders Stripe Payment Element via `https://js.stripe.com/v3/`.
5. After success, `/api/payment-status` verifies Stripe and marks the Woo order paid through the Woo plugin REST endpoint.
