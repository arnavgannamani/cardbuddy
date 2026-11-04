# Simulation: a year of agent purchases, with and without CardBuddy

Reproduce: `node sim/simulate.mjs` (fixed seed `20261112`, no PayPal calls, no server). Full output, including every
purchase, is in [`sim/results.json`](../sim/results.json).

## Slide stats

- **Same purchases, same three cards: CardBuddy earned $450.99 more in a year than a default-card agent (+106%).**
  $875.54 vs $424.55 on $21,227.56 of agent spending, against a 2%-everywhere default.
- **If your default card is a typical 1% card, the gap is $621.88 (+293%).**
- **Groceries and food delivery are most of the gain:** $238.16 + $153.21 = $391.37 of the $450.99 (86.8%).
- **The agent's three mistakes would have spent $1,957.12 with no human check. CardBuddy held all of it:** the $1,249 TV,
  the $612 wrong-date flight, and the $96.12 duplicate grocery order (same store and amount within 24 hours).
- **Add the PayPal Cashback Mastercard and pay through PayPal on 86 of 329 purchases: another $82.77.**

## Setup

| | |
|---|---|
| Wallet | Citi Double Cash (default, 2% cash), Amex Gold (4x dining and groceries, 3x flights booked direct, 1x else), Amex Blue Cash Preferred (6% groceries up to $6,000/yr, 6% streaming, 3% transit). Three cards, close to the U.S. average of about 3.7 actively used cards. |
| Purchases | 329 purchases, $21,227.56, all made by the agent on known store sites (`engine/stores.json`). Average month $1,768.96 (lowest $1,198, highest $2,462). |
| Without CardBuddy | Every purchase on the default card. No spending rules. |
| With CardBuddy | `choose()` from `src/choose.mjs` picks the best card-rail option per purchase; `check()` from `src/policy.mjs` applies the policy. |
| Point value | Amex Membership Rewards at 1.5 cents (the engine's value), so 4x = 6%. A 1.0-cent sensitivity is below. |
| Fees and credits | Left out: the wallet is the same with and without CardBuddy, so annual fees and card credits don't change the gap. |
| Rail | Headline is the card rail only (how CardBuddy pays today). PayPal checkout is reported separately. |

The year of purchases (per month unless noted, amounts drawn uniformly):

| What | Sites | Count | Amount |
|---|---|---|---|
| Food delivery | doordash.com, ubereats.com | 8 | $25-55 |
| Groceries | wholefoodsmarket.com, instacart.com | 4 (weekly) | $90-160 |
| Amazon | amazon.com | 4 | $20-90 |
| Rides | uber.com, lyft.com | 6 | $12-35 |
| Online shopping | etsy.com, target.com, bestbuy.com | 3 | $25-220 |
| Subscriptions | netflix.com $17.99, spotify.com $11.99 | 1 each | fixed |
| Flights | delta.com (Mar, Nov), united.com (Jul) | 3 a year | $250-600 |
| Stays | marriott.com (Jul), airbnb.com (Dec) | 2 a year | $200-700 |

## Rewards

### Headline (conservative): Double Cash as the default

| | Earned | Effective rate |
|---|---|---|
| Without CardBuddy (default card) | $424.55 | 2.00% |
| With CardBuddy (best card) | $875.54 | 4.12% |
| **Gap** | **$450.99 (+106.23%)** | **2.12% of spend** |

By category, sorted by gap:

| Category | Purchases | Spend | Without | With | Gap | CardBuddy's card |
|---|---:|---:|---:|---:|---:|---|
| Groceries | 48 | $5,954.00 | $119.08 | $357.24 | $238.16 | Blue Cash Preferred 6% |
| Dining (delivery) | 96 | $3,830.32 | $76.61 | $229.82 | $153.21 | Amex Gold 6% |
| Flights, hotels, rentals | 5 | $2,197.42 | $43.95 | $72.55 | $28.60 | Amex Gold 4.5% on flights; Double Cash 2% on stays |
| Transit and rideshare | 72 | $1,662.87 | $33.26 | $49.89 | $16.63 | Blue Cash Preferred 3% |
| Streaming | 24 | $359.76 | $7.20 | $21.59 | $14.39 | Blue Cash Preferred 6% |
| Amazon | 48 | $2,496.17 | $49.92 | $49.92 | $0.00 | Double Cash 2% (the default is already best) |
| Online shopping | 36 | $4,727.02 | $94.54 | $94.54 | $0.00 | Double Cash 2% (the default is already best) |
| **Total** | **329** | **$21,227.56** | **$424.55** | **$875.54** | **$450.99** | |

**Caps.** Tracked across the year (past a cap, the card earns the cap's `after` rate). None is exceeded:
Blue Cash Preferred groceries $5,954.00 of $6,000 (close: one more order would cross it, and CardBuddy would then move
groceries to the Amex Gold, also 6% at 1.5 cents a point); Amex Gold dining $3,830.32 of $50,000; Amex Gold groceries
$0 of $25,000. Checked with a five-orders-a-month variant that does cross the cap: the simulation switches to the Gold
from that order on.

### Variant: the default is a typical 1% card

`engine/cards.json` has no holdable flat-1% card (the lowest flat cards are Capital One VentureOne at 1.25x and several
1.5% cards), so this variant uses a **stand-in flat 1% cash-back card** in place of the Double Cash.

| | Earned |
|---|---|
| Without CardBuddy (1% default) | $212.28 |
| With CardBuddy (best of 1% card, Gold, Blue Cash Preferred) | $834.16 |
| **Gap** | **$621.88 (+292.96%, 2.93% of spend)** |

### Sensitivity: Amex Gold points at 1.0 cent instead of 1.5

With CardBuddy earns $781.78; the gap is **$357.23 (+84.14%, 1.68% of spend)**. Every card pick stays the same; the Gold's
dining rate falls from 6% to 4% and its flight rate from 4.5% to 3%.

### The other rail: PayPal checkout on a PayPal Cashback Mastercard

The 3-card wallet has no PayPal or Venmo card, so no other rail ever beats the best card there (0 purchases). Adding the
**PayPal Cashback Mastercard** (3% when you check out with PayPal, 1.5% otherwise) as a fourth card:

- On the card rail nothing changes (its 1.5% never beats the Double Cash's 2%): still $875.54.
- Paying **through PayPal** with it beats the best card on **86 purchases** for **$82.77 more**: Amazon (48 purchases,
  +$24.96), online shopping (36, +$47.27) and the two hotel stays (+$10.53), each 3% instead of 2%.
- Caveats: CardBuddy pays on the card rail today, so this is what a receipt would flag, not money it earns yet; and it
  assumes each of those merchants takes PayPal checkout.

## Spending rules: the agent's three mistakes

Policy: `perPurchase: 100`, **`monthlyBudget: 2500`** (the average simulated month is $1,768.96 and the highest $2,462,
so $2,500 is the usual month plus headroom), `approveCategories: ['travel']`. In the simulation the person approves
every legitimate purchase that's held and declines the mistakes.

| Mistake (scripted) | Amount | Without CardBuddy | With CardBuddy | Why |
|---|---:|---|---|---|
| (a) Same wholefoodsmarket.com order placed twice on Jan 4 | $96.12 | Went through | **Held for approval** | Same store and amount as a purchase paid in the last 24 hours |
| (b) $1,249 TV ordered when asked for a "$150 TV mount" (bestbuy.com, Sep 14) | $1,249.00 | Went through | **Held for approval** | Over the $100 per-purchase limit |
| (c) $612 flight booked on the wrong date (delta.com, May 20) | $612.00 | Went through | **Held for approval** | Over the per-purchase limit; travel always needs approval |

- **Money that went out with no human check:** $1,957.12 without CardBuddy; **$0 with CardBuddy**.
- **Two store rules catch repeats and splits.** A purchase is held if the same amount was paid at the same store in the
  last 24 hours (that's what catches the duplicate), or if purchases at one store within an hour add up past the
  per-purchase limit (what stops an agent splitting a $300 order into three $100 ones).
- **Being held is not the same as being caught.** For (b) and (c) the policy stops the payment and asks; the person still
  has to notice the wrong item or date in the approval request.
- **The cost of the rules: 70 of 329 legitimate purchases (21.3%, $11,473.13) also wait for approval**, about 1.3 a
  week: 39 grocery orders, 24 online orders, the 5 trips, and 2 same-day Amazon orders that add up past $100 (the
  simulation stamps every purchase at noon, so same-day orders count as within the hour; real ones are rarer). At a
  $200 limit that drops to 13, and all three mistakes are still held. The $2,500 budget never trips in this year; it's
  a backstop.

## Why this matters

Sourced figures only; caveats kept.

- **Agents are starting to shop.** Morgan Stanley (Dec 2025) estimates agentic shoppers could reach **$190B-$385B of
  U.S. e-commerce spending by 2030, about 10-20% of online retail**, and found **~23% of Americans bought something via
  AI in the past month**. ([Morgan Stanley](https://www.morganstanley.com/insights/articles/agentic-commerce-market-impact-outlook))
- Bigger forecasts exist: McKinsey's **$900B-$1T of U.S. B2C agentic commerce by 2030, $3-5T globally**, as reported
  by a secondary source; we haven't seen the McKinsey original.
  ([as reported by Stellagent](https://stellagent.ai/insights/agentic-commerce-market-size-forecast-2030))
- **People hold several cards, and the agent uses one.** Americans use about **3.7 credit cards actively** on average
  (Experian, 2025). ([Experian](https://www.experian.com/blogs/ask-experian/average-number-of-credit-cards-a-person-has/))
- **Rewards are hard to judge by hand:** **53% of U.S. adults don't know what 10,000 points or miles are worth**
  (Bankrate). ([Bankrate](https://www.bankrate.com/credit-cards/news/credit-card-rewards-survey))
- **Agent payment tools don't ask first.** PayPal's Agent Toolkit and MCP server give agents payment tools; a July 2026
  review notes they have **no automatic human-confirmation gate**.
  ([Vorp Labs](https://vorplabs.com/agent-tools/paypal-agent-toolkit))

### ESTIMATE (an illustration, not a forecast)

What would an industry of default-card agents leave behind per year by 2030? Apply the simulation's gap, as a share of
spend, to Morgan Stanley's range:

- Gap as % of spend (headline, Double Cash default): $450.99 / $21,227.56 = **2.12%**
- Low: 2.12% x $190B = **$4.028B a year**
- High: 2.12% x $385B = **$8.162B a year**

With Amex Gold points at 1.0 cent (1.68% of spend), the same arithmetic gives $3.192B-$6.468B (1.68% x $190B and x $385B).

This assumes every agent dollar is paid with a rewards card, from a wallet like this one, on this simulated mix of
purchases, and that the agent's default is a 2% card (a 1% default would make the gap larger). Real agent spending,
wallets and mixes will differ. It's an illustration of scale, not a forecast.

## Method notes and limits

- One simulated person and one seed. Change `SEED` in `sim/simulate.mjs` to see the spread; the categories and rates
  drive the result more than the draws.
- Instacart: `engine/stores.json` warns that some issuers don't code Instacart as groceries. The simulation counts it as
  groceries (6% on the Blue Cash Preferred). If Amex coded it otherwise, the Double Cash's 2% would be best on those 24
  orders ($3,118.66), and the gap would shrink by about $124.75.
- Amex Gold's 3x on flights requires booking direct with the airline (delta.com, united.com are direct).
- The agent's mistakes are left out of the rewards totals: they're money that shouldn't have been spent.
- Caps: `choose()` scores one purchase as if no cap were used; the year-long cap tracking lives in the simulation. In
  this year no cap is crossed, so it doesn't change the result, but the live CardBuddy doesn't yet track cap usage.
