// The spending rules an agent can't skip. A purchase goes through on its own only if it's within the per-purchase
// limit, keeps this month within the budget, and isn't in a category the person wants to approve.
const usd = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function check(policy, receipts, purchase, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const spent = receipts.filter(r => r.status === 'paid' && r.at.slice(0, 7) === month).reduce((s, r) => s + r.amount, 0);
  const reasons = [];
  if (purchase.amount > policy.perPurchase) reasons.push(`${usd(purchase.amount)} is over the ${usd(policy.perPurchase)} per-purchase limit`);
  if (spent + purchase.amount > policy.monthlyBudget) reasons.push(`it would take this month to ${usd(spent + purchase.amount)}, over the ${usd(policy.monthlyBudget)} budget`);
  if (policy.approveCategories.includes(purchase.category)) reasons.push(`${purchase.category} purchases always need your approval`);
  return { ok: !reasons.length, reasons, spentThisMonth: Math.round(spent * 100) / 100 };
}
