// Local state in data/ (git-ignored): the wallet (vault tokens and which card each one is, never card numbers), the
// spending policy, purchases waiting for approval, and receipts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CARDBUDDY_DATA points tests at a throwaway folder so they never touch the real wallet.
const DIR = process.env.CARDBUDDY_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DEFAULTS = {
  wallet: [],
  // Purchases above perPurchase, past the monthly budget, or in these categories wait for the person's approval.
  policy: { perPurchase: 100, monthlyBudget: 500, approveCategories: ['travel'] },
  pending: [],
  receipts: [],
  declined: []
};

// Only a missing file means "use the defaults". A corrupt one throws: read as empty, it would zero this month's spend
// and be overwritten (history and vault tokens gone) on the next save.
export function load(name) {
  let text;
  try { text = fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return structuredClone(DEFAULTS[name]); throw e; }
  return JSON.parse(text);
}
// Written to a temp file and renamed into place, so a crash mid-write leaves the old file, never half of the new one.
export function save(name, value) {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, name + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
