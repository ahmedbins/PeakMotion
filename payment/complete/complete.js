const params = new URLSearchParams(window.location.search);
const statusBanner = document.querySelector('#statusBanner');
const completeTitle = document.querySelector('#completeTitle');
const completeText = document.querySelector('#completeText');
const returnLink = document.querySelector('#returnLink');

function setState(title, text, type = '') {
  completeTitle.textContent = title;
  completeText.textContent = text;
  statusBanner.textContent = text;
  statusBanner.className = `status-banner ${type}`.trim();
}

async function confirmStatus() {
  const paymentIntent = params.get('payment_intent') || '';
  const payload = params.get('mpb') || '';
  const signature = params.get('sig') || '';

  if (!paymentIntent || !payload || !signature) {
    setState('Missing payment details', 'This return link is missing Stripe or order verification details.', 'error');
    return;
  }

  const response = await fetch('/api/payment-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntent, payload, signature })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    setState('Payment needs review', data.error || 'The payment could not be confirmed automatically.', 'error');
    return;
  }

  if (data.status === 'succeeded') {
    setState('Payment complete', 'Your payment was confirmed. Returning you to the Meptides receipt.', 'success');
    if (data.successUrl) {
      returnLink.href = data.successUrl;
      returnLink.hidden = false;
      window.setTimeout(() => {
        window.location.href = data.successUrl;
      }, 1600);
    }
    return;
  }

  setState('Payment pending', `Stripe returned status: ${data.status}.`, '');
  if (data.cancelUrl) {
    returnLink.href = data.cancelUrl;
    returnLink.textContent = 'Return to checkout';
    returnLink.hidden = false;
  }
}

confirmStatus().catch(() => {
  setState('Payment needs review', 'Unexpected confirmation error. Please contact support with your order number.', 'error');
});
