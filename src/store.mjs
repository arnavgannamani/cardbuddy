// Local state in data/ (git-ignored): the wallet (vault tokens and which card each one is, never card numbers), the
// spending policy, purchases waiting for approval, and receipts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// AGENTPAY_DATA points tests at a throwaway folder so they never touch the real wallet.
const DIR = process.env.AGENTPAY_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DEFAULTS = {
  wallet: [],
  // Purchases above perPurchase, past the monthly budget, or in these categories wait for the person's approval.
  policy: { perPurchase: 100, monthlyBudget: 500, approveCategories: ['travel'] },
  pending: [],
  receipts: [],
  declined: []
};

export function load(name) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8')); }
  catch { return structuredClone(DEFAULTS[name]); }
}
export function save(name, value) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, name + '.json'), JSON.stringify(value, null, 2) + '\n');
}
