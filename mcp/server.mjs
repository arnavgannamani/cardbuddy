#!/usr/bin/env node
// CardBuddy as an MCP server: the tools an AI agent uses to pay. It is a thin client of the CardBuddy server
// (server.mjs, CARDBUDDY_URL, default http://localhost:4242): the PayPal keys, the vault tokens and the spending rules
// stay there, so the agent can see the rules but has no tool to change them, and nothing it sends can skip them.
// ponytail: the MCP wire format is written out by hand (JSON-RPC lines on stdin/stdout), as in pointmaxx-mcp.
// The hosted CardBuddy also serves these tools at /mcp (server.mjs): it imports handle() and calls its own routes.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const BASE = (process.env.CARDBUDDY_URL || 'http://localhost:4242').replace(/\/+$/, '');
const VERSION = '0.1.0', VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CATS = ['dining', 'groceries', 'gas', 'travel', 'transit', 'streaming', 'entertainment', 'amazon', 'online', 'drugstore', 'utilities', 'other'];

export class Bad extends Error {} // a problem the agent can fix (bad input, CardBuddy said no): reported back as a tool error

let api = httpApi;
// server.mjs swaps in its own routes, so the hosted /mcp never goes back out over HTTP.
export function useApi(fn) { api = fn; }

async function httpApi(path, body) {
  let res;
  try {
    res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  } catch {
    throw new Bad(`CardBuddy isn't running at ${BASE}. Start it with npm start in the pointmaxx-agentpay folder.`);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Bad(j.error || `CardBuddy answered HTTP ${res.status}.`);
  return j;
}

// The purchase fields every paying tool takes.
const PURCHASE = {
  amount: { type: 'number', minimum: 0.01, maximum: 10000, description: 'Total in US dollars, including tax and shipping.' },
  site: { type: 'string', maxLength: 200, description: 'The store\'s website, e.g. "wholefoodsmarket.com". CardBuddy knows the category of thousands of stores.' },
  merchant: { type: 'string', maxLength: 200, description: 'The store\'s name, when there is no website.' },
  category: { type: 'string', enum: CATS, description: 'The spending category. Needed when the store is not one CardBuddy knows.' },
  description: { type: 'string', maxLength: 120, description: 'What is being bought, in a few words. Shown to the person on the receipt and in approvals.' }
};
function purchase(a) {
  if (a.site == null && a.merchant == null) throw new Bad('Give the store as site (its website) or merchant (its name).');
  return { amount: a.amount, site: a.site, merchant: a.merchant, category: a.category, description: a.description };
}

const TOOLS = [
  {
    name: 'get_wallet',
    description: 'The cards the person has allowed this agent to pay with (name, network, last four digits) and which one is their default. Card numbers are never available.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    run: async () => ({ cards: (await api('/api/wallet')).map(c => ({ card: c.card, network: c.brand, last4: c.last4, isDefault: !!c.isDefault })) })
  },
  {
    name: 'recommend_card',
    description: 'Which card CardBuddy would pay a purchase with, how much it earns and why, compared with the person\'s default card. Does not pay or check the spending rules.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['amount'], properties: PURCHASE },
    run: async a => {
      const r = await api('/api/recommend', purchase(a));
      return { store: r.store, category: r.categoryLabel, card: r.best.card, percentBack: r.best.percentBack, why: r.best.why, earns: r.earns,
        defaultCard: r.defaultCard.card, defaultEarns: r.defaultEarns, extra: Math.round((r.earns - r.defaultEarns) * 100) / 100, warning: r.warning || null };
    }
  },
  {
    name: 'search_store',
    description: 'Search the CardBuddy demo store (fictional shops standing in for PayPal merchants: Greenleaf Market for groceries, Night Owl Kitchen for restaurant delivery, Voltline Electronics, Skyline Air for flights) for what the person asked for. Returns items with their ids and prices. Use it when the person names a thing to buy rather than an amount, then check out with checkout.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['query'], properties: {
      query: { type: 'string', maxLength: 200, description: 'What to look for, in a few words, e.g. "weekly groceries" or "65 inch tv".' },
      store: { type: 'string', maxLength: 100, description: 'Optional: one store\'s name or id to search in.' }
    } },
    run: async a => api('/api/shop/search', { query: a.query, store: a.store })
  },
  {
    name: 'checkout',
    description: 'Buy items from the demo store. The store works out the total (tax and delivery included) and CardBuddy pays it through PayPal with the card that earns the most, or holds it for the person\'s approval if it\'s outside their rules (same as pay). All items must come from one store. If the person gave a limit ("keep it under $100"), pass it as maxTotal: a total above it waits for their approval instead of being paid. Never retry or split an order to get under the rules.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['items'], properties: {
      items: { type: 'array', minItems: 1, maxItems: 20, description: 'The items to buy, from search_store.', items: { type: 'object', additionalProperties: false, required: ['id'], properties: {
        id: { type: 'string', maxLength: 40, description: 'An item id from search_store.' },
        quantity: { type: 'integer', minimum: 1, maximum: 20, description: 'How many (default 1).' }
      } } },
      maxTotal: { type: 'number', minimum: 0.01, maximum: 10000, description: 'Optional: the most the person said to spend on this order, in US dollars.' }
    } },
    run: async a => {
      const r = await api('/api/shop/checkout', { items: a.items, maxTotal: a.maxTotal });
      const cart = { store: r.cart.store, items: r.cart.items.map(i => ({ name: i.name, quantity: i.quantity, lineTotal: i.lineTotal })), subtotal: r.cart.subtotal, tax: r.cart.tax, delivery: r.cart.delivery, total: r.cart.total };
      if (r.status === 'needs_approval') return { status: 'needs_approval', cart, pendingId: r.pendingId, reasons: r.reasons, cardIfApproved: r.card, approveAt: r.approveAt, personAlertedByEmail: r.personAlerted };
      return { cart, ...receipt(r) };
    }
  },
  {
    name: 'pay',
    description: 'Pay for a purchase through PayPal with the card that earns the most. If the purchase is outside the person\'s spending rules it is NOT paid: the result has status "needs_approval", a pendingId and the reasons. Then tell the person it is waiting for their approval (if personAlertedByEmail is true, they\'ve been emailed about it) and check later with purchase_status. Never retry, split a purchase into smaller ones, or change the amount to get under the rules. If the status is "unknown", PayPal didn\'t answer in time and may have charged: do not pay again, tell the person to check PayPal.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['amount', 'description'], properties: PURCHASE },
    run: async a => {
      const r = await api('/api/pay', purchase(a));
      if (r.status === 'needs_approval') return { status: 'needs_approval', pendingId: r.pendingId, reasons: r.reasons, cardIfApproved: r.card, approveAt: r.approveAt, personAlertedByEmail: r.personAlerted };
      return receipt(r);
    }
  },
  {
    name: 'purchase_status',
    description: 'What happened to a purchase that needed approval: still waiting, approved and paid (with the receipt), or declined by the person.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['pendingId'], properties: { pendingId: { type: 'string', maxLength: 100, description: 'The pendingId pay returned.' } } },
    run: async a => {
      const r = await api('/api/purchase-status', { id: a.pendingId });
      return r.receipt ? { status: r.status, receipt: receipt(r.receipt) } : r;
    }
  },
  {
    name: 'list_receipts',
    description: 'Recent purchases this agent made, newest first, with the card used, rewards earned and what the default card would have earned, plus totals.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many to return (default 10).' } } },
    run: async a => {
      const d = await api('/api/receipts');
      return { totals: d.totals, receipts: d.receipts.slice(0, a.limit || 10).map(receipt) };
    }
  },
  {
    name: 'spending_rules',
    description: 'The person\'s spending rules (most for one purchase, monthly budget, categories that always need approval) and how much has been spent this month. Read-only: only the person can change them.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    run: async () => {
      const p = await api('/api/policy'), spent = p.spentThisMonth;
      return { perPurchase: p.perPurchase, monthlyBudget: p.monthlyBudget, alwaysAskFor: p.approveCategories,
        spentThisMonth: spent, leftThisMonth: Math.max(0, Math.round((p.monthlyBudget - spent) * 100) / 100) };
    }
  }
];

// The parts of a receipt an agent needs: no vault ids or PayPal internals beyond the order id.
function receipt(r) {
  return { id: r.id, status: r.status, at: r.at, store: r.merchant, description: r.description, amount: r.amount,
    card: r.card, percentBack: r.percentBack, earned: r.earned, defaultCard: r.defaultCard, defaultEarned: r.defaultEarned,
    declinedCards: r.declined && r.declined.length ? r.declined : undefined, paypalOrderId: r.paypal ? r.paypal.orderId : undefined, dryRun: r.dryRun || undefined };
}

// No prototype: a tool name like "constructor" must not find a built-in.
const RUN = Object.assign(Object.create(null), Object.fromEntries(TOOLS.map(t => [t.name, t])));
const LIST = TOOLS.map(({ run, ...t }) => t);

// One JSON-RPC message in, its response out (undefined for a notification, which gets none).
export async function handle(msg) {
  const { id, method, params } = msg || {};
  const reply = result => id !== undefined ? { jsonrpc: '2.0', id, result } : undefined;
  const fail = (code, message) => id !== undefined ? { jsonrpc: '2.0', id, error: { code, message } } : undefined;
  if (method === 'initialize') return reply({ protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'cardbuddy', version: VERSION } });
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: LIST });
  if (method === 'tools/call') {
    const tool = typeof params?.name === 'string' ? RUN[params.name] : undefined;
    if (!tool) return fail(-32602, 'Unknown tool: ' + String(params?.name).slice(0, 50));
    try {
      const args = params.arguments ?? {}, allowed = Object.keys(tool.inputSchema.properties);
      if (typeof args !== 'object' || Array.isArray(args) || args === null) throw new Bad('arguments must be an object.');
      const extra = Object.keys(args).filter(k => !allowed.includes(k));
      if (extra.length) throw new Bad(`Unknown argument${extra.length > 1 ? 's' : ''}: ${extra.slice(0, 5).map(k => k.slice(0, 30)).join(', ')}. Allowed: ${allowed.join(', ') || 'none'}.`);
      const missing = (tool.inputSchema.required || []).filter(k => args[k] == null);
      if (missing.length) throw new Bad('Missing: ' + missing.join(', ') + '.');
      const out = await tool.run(args);
      return reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out });
    } catch (e) {
      if (e instanceof Bad) return reply({ content: [{ type: 'text', text: e.message }], isError: true });
      process.stderr.write('cardbuddy-mcp: ' + (e && e.stack || e) + '\n'); // the host's log, never the agent
      return reply({ content: [{ type: 'text', text: 'CardBuddy hit an internal error.' }], isError: true });
    }
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return;
  return fail(-32601, 'Method not found');
}
// ---------- MCP over stdio: one JSON-RPC message per line, when run directly (not imported by server.mjs) ----------
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) stdio();
function stdio() {
  // Lines are split by hand so an endless line can't grow without bound: past 100 KB it's dropped until its newline.
  const MAX = 100000;
  let buf = '', skipping = false;
  function onLine(line) {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
    handle(msg).then(r => r && send(r)).catch(e => process.stderr.write('cardbuddy-mcp: ' + (e && e.stack || e) + '\n')); // one bad message never stops the server
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    let i;
    buf += chunk;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (skipping) skipping = false; else onLine(line);
    }
    if (buf.length > MAX) {
      if (!skipping) send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Message too large' } });
      skipping = true; buf = '';
    }
  });
}
