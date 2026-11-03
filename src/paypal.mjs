// The PayPal REST API, sandbox only: the base URL is fixed so nothing here can move real money. Credentials come from
// .env (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET) and are only ever sent to PayPal.
import { randomUUID } from 'node:crypto';
import { Bad } from './choose.mjs';

const BASE = 'https://api-m.sandbox.paypal.com';
let token = null, tokenUntil = 0;

async function accessToken() {
  if (token && Date.now() < tokenUntil) return token;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Bad('PayPal isn\'t set up: put the sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env (see .env.example).');
  const r = await fetch(BASE + '/v1/oauth2/token', { method: 'POST', signal: AbortSignal.timeout(15000), body: 'grant_type=client_credentials',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Bad('The PayPal sandbox didn\'t accept the credentials in .env (HTTP ' + r.status + ').');
  const j = await r.json();
  token = j.access_token; tokenUntil = Date.now() + (j.expires_in - 60) * 1000;
  return token;
}

async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, signal: AbortSignal.timeout(20000), body: body && JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json', 'PayPal-Request-Id': randomUUID() } });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = (out.details || []).map(d => d.issue + (d.description ? ': ' + d.description : '')).join('; ');
    throw new Bad('PayPal said no (HTTP ' + r.status + '): ' + (out.message || out.name || 'unknown error') + (detail ? ' [' + detail + ']' : ''));
  }
  return out;
}

// Saving a card without a purchase (Vault API v3): a setup token for PayPal's card fields to fill in the browser, then a
// payment token made from it. The card number only ever goes from the browser to PayPal.
export async function createSetupToken() {
  const r = await api('POST', '/v3/vault/setup-tokens', { payment_source: { card: { experience_context: { brand_name: 'AgentPay' } } } });
  return { id: r.id, status: r.status };
}
export async function createPaymentToken(setupTokenId) {
  if (typeof setupTokenId !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(setupTokenId)) throw new Bad('setupTokenId is missing or malformed.');
  const r = await api('POST', '/v3/vault/payment-tokens', { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } });
  const card = (r.payment_source && r.payment_source.card) || {};
  return { vaultId: r.id, customerId: r.customer && r.customer.id, brand: card.brand || null, last4: card.last_digits || null, expiry: card.expiry || null };
}

// Paying with a saved card while the person isn't there: a merchant-initiated, unscheduled charge on the stored card.
export async function payWithVaultedCard({ vaultId, amount, description, invoiceId }) {
  const order = await api('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ description: String(description || 'AgentPay purchase').slice(0, 127), invoice_id: invoiceId, amount: { currency_code: 'USD', value: amount.toFixed(2) } }],
    payment_source: { card: { vault_id: vaultId, stored_credential: { payment_initiator: 'MERCHANT', payment_type: 'UNSCHEDULED', usage: 'SUBSEQUENT' } } }
  });
  // Some orders made with a vault ID come back already captured; otherwise capture now.
  const done = order.status === 'COMPLETED' ? order : await api('POST', '/v2/checkout/orders/' + order.id + '/capture', {});
  const cap = done.purchase_units && done.purchase_units[0].payments && done.purchase_units[0].payments.captures && done.purchase_units[0].payments.captures[0];
  return { orderId: done.id, status: done.status, captureId: cap ? cap.id : null, captureStatus: cap ? cap.status : null };
}
