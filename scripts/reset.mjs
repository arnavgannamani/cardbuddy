// Start a clean history before a demo: receipts, held purchases and declines move into data/archive/<time>/, and the
// wallet (vault tokens) and spending rules stay. Nothing is deleted, so an archive can be put back by moving its files
// into data/. Safe while the server is running: it reads data/ on every request.
// Usage: npm run reset            (refuses if a payment's result is still unknown)
//        npm run reset -- --force (archives those too)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/env.mjs';

const DIR = process.env.CARDBUDDY_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILES = ['receipts', 'pending', 'declined'];
const read = name => { try { return JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

const receipts = read('receipts') || [];
// A payment still in flight or with an unknown result may have been charged; archiving it would drop it from this
// month's spend, so ask for --force.
const unsure = receipts.filter(r => r.status === 'unknown' || r.status === 'processing');
if (unsure.length && !process.argv.includes('--force')) {
  console.error(`${unsure.length} payment(s) have no final result yet (${unsure.map(r => '$' + r.amount + ' at ' + r.merchant).join(', ')}). ` +
    'Check them in the PayPal sandbox first, or run npm run reset -- --force to archive them anyway.');
  process.exit(1);
}

const present = FILES.filter(f => fs.existsSync(path.join(DIR, f + '.json')));
if (!present.length) { console.log('Nothing to clear: no receipts, held purchases or declines.'); process.exit(0); }

const dest = path.join(DIR, 'archive', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dest, { recursive: true });
for (const f of present) fs.renameSync(path.join(DIR, f + '.json'), path.join(dest, f + '.json'));

const count = name => { try { return JSON.parse(fs.readFileSync(path.join(dest, name + '.json'), 'utf8')).length; } catch { return 0; } };
console.log(`Cleared: ${count('receipts')} receipts, ${count('pending')} held purchases, ${count('declined')} declines.`);
console.log(`Kept: your wallet and spending rules. The old history is in ${path.relative(process.cwd(), dest)}.`);
