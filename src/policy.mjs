// The spending rules an agent can't skip. A purchase goes through on its own only if it's within the per-purchase
// limit, keeps this month within the budget, isn't in a category the person wants to approve, and doesn't look like
// a repeat or a split of another purchase at the same store.
const usd = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HOUR = 36e5, DAY = 24 * HOUR;

// A payment whose result is unknown, or still in flight, counts: PayPal may have charged it.
const COUNTS = new Set(['paid', 'unknown', 'processing']);

// The person's month, not UTC's (which ends around 7pm on the last day in Boston).
const monthOf = d => d.getFullYear() + '-' + d.getMonth();
export function spentThisMonth(receipts, now = new Date()) {
  const spent = receipts.filter(r => COUNTS.has(r.status) && monthOf(new Date(r.at)) === monthOf(now)).reduce((s, r) => s + r.amount, 0);
  return Math.round(spent * 100) / 100;
}

// purchase: { amount, category, guessedCategory?, store?, maxTotal? }. pending: purchases already held for approval.
export function check(policy, receipts, purchase, now = new Date(), pending = []) {
  const spent = spentThisMonth(receipts, now);
  const reasons = [];
  // The person's own ceiling for this one purchase ("keep it under $100"), when the agent was given one.
  if (purchase.maxTotal != null && purchase.amount > purchase.maxTotal) reasons.push(`the total came to ${usd(purchase.amount)}, more than the ${usd(purchase.maxTotal)} you set for this purchase`);
  if (purchase.amount > policy.perPurchase) reasons.push(`${usd(purchase.amount)} is over the ${usd(policy.perPurchase)} per-purchase limit`);
  if (spent + purchase.amount > policy.monthlyBudget) reasons.push(`it would take this month to ${usd(spent + purchase.amount)}, over the ${usd(policy.monthlyBudget)} budget`);
  if (policy.approveCategories.includes(purchase.category)) reasons.push(`${purchase.category} purchases always need your approval`);
  else if (policy.approveCategories.includes(purchase.guessedCategory)) reasons.push(`CardBuddy reads ${purchase.store} as ${purchase.guessedCategory}, and ${purchase.guessedCategory} purchases always need your approval`);
  if (purchase.store) {
    const ago = r => now - new Date(r.at), here = receipts.filter(r => COUNTS.has(r.status) && r.merchant === purchase.store && ago(r) >= 0);
    // The same amount at the same store within a day: most likely the agent placing an order twice.
    if (here.some(r => r.amount === purchase.amount && ago(r) < DAY)) reasons.push(`${usd(purchase.amount)} was already paid at ${purchase.store} in the last 24 hours`);
    // Several smaller payments at one store within an hour that add up past the limit: a split purchase.
    // ponytail: a fixed one-hour window; a split spread over a day still gets through below the monthly budget.
    const lastHour = Math.round(here.filter(r => ago(r) < HOUR).reduce((s, r) => s + r.amount, 0) * 100) / 100;
    if (lastHour && purchase.amount <= policy.perPurchase && lastHour + purchase.amount > policy.perPurchase) reasons.push(`with ${usd(lastHour)} already paid at ${purchase.store} in the last hour, it comes to ${usd(lastHour + purchase.amount)}, over the ${usd(policy.perPurchase)} per-purchase limit`);
    const waiting = pending.find(p => p.store === purchase.store);
    if (waiting) reasons.push(`a ${usd(waiting.purchase.amount)} purchase at ${purchase.store} is already waiting for your approval`);
  }
  return { ok: !reasons.length, reasons, spentThisMonth: spent };
}
