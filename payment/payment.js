const params = new URLSearchParams(window.location.search);
const encodedPayload = params.get('mpb') || '';
const signature = params.get('sig') || '';

const statusBanner = document.querySelector('#statusBanner');
const paymentForm = document.querySelector('#paymentForm');
const submitButton = document.querySelector('#submitButton');
const buttonText = document.querySelector('#buttonText');
const orderTitle = document.querySelector('#orderTitle');
const orderMeta = document.querySelector('#orderMeta');
const summaryTotal = document.querySelector('#summaryTotal');
const lineItems = document.querySelector('#lineItems');
const orderDetails = document.querySelector('#orderDetails');

let stripe;
let elements;

function showStatus(message, type = '') {
  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`.trim();
}

function decodePayload(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return JSON.parse(decodeURIComponent(Array.from(atob(padded), (char) => (
    `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  )).join('')));
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: String(currency || 'CAD').toUpperCase()
  }).format((Number(amount) || 0) / 100);
}

function renderOrder(payload) {
  orderTitle.textContent = 'Complete payment';
  orderMeta.textContent = payload.order_id ? `Order #${payload.order_id}` : 'Payment details';
  summaryTotal.textContent = formatMoney(payload.amount, payload.currency);

  if (orderDetails) {
    const rows = [
      ['Reference', payload.order_id ? `#${payload.order_id}` : ''],
      ['Email', payload.email],
      ['Ship to', payload.ship_to],
      ['Delivery', payload.shipping_method]
    ];
    orderDetails.innerHTML = '';
    for (const [label, value] of rows) {
      if (!value) continue;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      orderDetails.append(dt, dd);
    }
  }

  lineItems.innerHTML = '';

  for (const item of payload.items || []) {
    const row = document.createElement('div');
    row.className = 'line-item';
    const detail = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = item.name;
    detail.append(name, document.createElement('br'), `Qty ${item.quantity}`);

    const amount = document.createElement('span');
    amount.textContent = formatMoney(item.subtotal, payload.currency);

    row.append(detail, amount);
    lineItems.append(row);
  }
}

async function initialize() {
  if (!encodedPayload || !signature) {
    showStatus('This payment link is missing order verification details.', 'error');
    return;
  }

  let payload;
  try {
    payload = decodePayload(encodedPayload);
    renderOrder(payload);
  } catch {
    showStatus('This payment link could not be read. Please return to checkout and try again.', 'error');
    return;
  }

  showStatus('Creating a secure Stripe payment session.');

  const response = await fetch('/api/payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: encodedPayload, signature })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(data.error || 'Unable to start the payment. Please return to checkout and try again.', 'error');
    return;
  }

  stripe = Stripe(data.publishableKey);
  elements = stripe.elements({
    clientSecret: data.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#111111',
        colorText: '#111111',
        colorTextSecondary: '#555555',
        colorBackground: '#ffffff',
        colorDanger: '#ef4143',
        borderRadius: '12px',
        fontFamily: 'Manrope, system-ui, sans-serif'
      }
    },
    defaultValues: {
      billingDetails: {
        email: payload.email || undefined,
        name: payload.name || undefined
      }
    }
  });

  elements.create('payment').mount('#paymentElement');

  paymentForm.hidden = false;
  showStatus('Stripe payment form ready.', 'success');
}

paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!stripe || !elements) return;

  submitButton.disabled = true;
  buttonText.textContent = 'Processing...';
  showStatus('Confirming payment with Stripe.');

  const returnUrl = new URL('/payment/complete/', window.location.origin);
  returnUrl.searchParams.set('mpb', encodedPayload);
  returnUrl.searchParams.set('sig', signature);

  const result = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: returnUrl.toString()
    }
  });

  if (result.error) {
    showStatus(result.error.message || 'Payment could not be completed.', 'error');
    submitButton.disabled = false;
    buttonText.textContent = 'Pay now';
  }
});

initialize().catch(() => {
  showStatus('Unexpected payment error. Please return to checkout and try again.', 'error');
});
