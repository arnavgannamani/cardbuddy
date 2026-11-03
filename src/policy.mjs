// The spending rules an agent can't skip. A purchase goes through on its own only if it's within the per-purchase
// limit, keeps this month within the budget, and isn't in a category the person wants to approve.
const usd = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The person's month, not UTC's (which ends around 7pm on the last day in Boston). A payment whose result is unknown
// counts: PayPal may have charged it.
const monthOf = d => d.getFullYear() + '-' + d.getMonth();
export function spentThisMonth(receipts, now = new Date()) {
  const spent = receipts.filter(r => (r.status === 'paid' || r.status === 'unknown') && monthOf(new Date(r.at)) === monthOf(now)).reduce((s, r) => s + r.amount, 0);
  return Math.round(spent * 100) / 100;
}

export function check(policy, receipts, purchase, now = new Date()) {
  const spent = spentThisMonth(receipts, now);
  const reasons = [];
  if (purchase.amount > policy.perPurchase) reasons.push(`${usd(purchase.amount)} is over the ${usd(policy.perPurchase)} per-purchase limit`);
  if (spent + purchase.amount > policy.monthlyBudget) reasons.push(`it would take this month to ${usd(spent + purchase.amount)}, over the ${usd(policy.monthlyBudget)} budget`);
  if (policy.approveCategories.includes(purchase.category)) reasons.push(`${purchase.category} purchases always need your approval`);
  return { ok: !reasons.length, reasons, spentThisMonth: spent };
}
