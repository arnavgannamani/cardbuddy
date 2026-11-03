# PointMaxx AgentPay

**A card-aware payment layer for AI agents on PayPal.** When an agent buys something, AgentPay picks the card in
your PayPal wallet that earns the most on that purchase, checks it against the spending rules you set, and pays through
the PayPal Orders API. Every purchase leaves a receipt that shows what the right card earned versus your default.

Built for the PayPal AI Hackathon (Nov 2026).

## The problem

Agents are starting to shop: PayPal ships an Agent Toolkit and a hosted MCP server so agents can create and capture
orders. But an agent pays with whatever card is the default. People who pick cards carefully (3% on dining here, 6% on
groceries there, PayPal Cashback's 3% on PayPal checkout, the Venmo Card's 3% on Venmo checkout) lose all of it the
moment an agent takes over the checkout. And today an agent with payment tools can spend without any built-in
confirmation step.

## What AgentPay does

1. **Your wallet, in PayPal.** You save your cards to PayPal's vault once, through PayPal's own card fields: AgentPay
   never sees a card number. It stores only PayPal's vault tokens and which card each one is (say "Amex Gold").
2. **The right card, every time.** Before any payment, AgentPay classifies the purchase (merchant, category, whether it
   goes through PayPal or Venmo checkout) and runs every card in your wallet through the PointMaxx rewards engine: 55
   US cards' rates, caps, rotating categories and point values. It picks the one that earns the most, including the
   PayPal Cashback Mastercard's 3% on PayPal checkout and the Venmo Card's 3% on Venmo checkout.
3. **Rules the agent can't skip.** You set a spending policy: a per-purchase limit, a monthly budget, and categories or
   merchants that always need your approval. Anything outside it pauses for a one-tap approval in PayPal. This is the
   human-in-the-loop step agent payments are missing.
4. **Pays through PayPal.** AgentPay creates and captures the order with the PayPal Orders API using the chosen card's
   vault token (sandbox for the hackathon).
5. **A rewards receipt.** Each purchase logs: what was bought, the card used, what it earned, and what your default card
   would have earned. A running total shows what the agent has earned you.

## How agents use it

- **As an MCP server** (`agentpay-mcp`): tools like `wallet`, `choose_card`, `pay`, `approve`, `receipts`. Works next to
  PayPal's own MCP server, in Claude or any MCP client.
- **As middleware for the PayPal Agent Toolkit**: wraps its order tools so any toolkit agent picks the right card and
  respects the policy, with one line of setup.
- **For humans at checkout**: the PointMaxx Chrome extension recognizes PayPal and Venmo checkout windows and shows which
  card to pick in them, using the same engine.

## The demo (under 3 minutes)

1. A person asks Claude: "Order dinner from the demo restaurant, and restock groceries from the demo market."
2. Claude calls AgentPay. Dinner goes on the Amex Gold (6%), groceries on the Blue Cash Preferred (6%), each paid
   through PayPal in the sandbox.
3. A $300 electronics order trips the policy: it pauses, the person approves it in PayPal, and it completes on the card
   that earns most there.
4. The receipts page: "Your agent earned $X more than your default card this month."

## Status

Planning. See [docs/PLAN.md](docs/PLAN.md) for the build plan, open questions and who does what.

## License

MIT, see [LICENSE](LICENSE). The rewards engine and card data come from PointMaxx (pointmaxx.app); card data includes
CardPin (MIT).
