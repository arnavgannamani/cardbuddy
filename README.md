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
2. **The right card, every time.** Before any payment, AgentPay classifies the purchase (from the store's website, or
   from its name for a store it doesn't know) and runs every card in your wallet through the PointMaxx rewards engine:
   55 US cards' rates, caps, rotating categories and point values. It pays with the card that earns the most, and
   the receipt says when paying through PayPal or Venmo checkout would earn more (the PayPal Cashback Mastercard's 3%,
   the Venmo Card's 3%).
3. **Rules the agent can't skip.** You set a spending policy: a per-purchase limit, a monthly budget, and categories
   that always need your approval. AgentPay also holds a purchase that repeats one at the same store within 24 hours,
   that adds up past the limit with others at that store within an hour (a split order), or that comes from a store
   with a purchase already waiting. Anything outside the rules waits on AgentPay's Approvals page for you to approve or
   decline, with an email to your phone if you turn alerts on. This is the human-in-the-loop step agent payments are
   missing.
4. **Pays through PayPal.** AgentPay creates and captures the order with the PayPal Orders API using the chosen card's
   vault token (sandbox for the hackathon).
5. **A rewards receipt.** Each purchase logs: what was bought, the card used, what it earned, and what your default card
   would have earned. A running total shows what the agent has earned you.

## How agents use it

- **As an MCP server** (`mcp/server.mjs`, connected automatically by `.mcp.json` when you open the repo in Claude
  Code). Six tools: `get_wallet`, `recommend_card`, `pay`, `purchase_status`, `list_receipts` and `spending_rules`. The
  agent can read the rules but has no tool to change them or to approve its own purchases.
- **Planned:** a hosted connector URL for Grok, ChatGPT and claude.ai; middleware for the PayPal Agent Toolkit; and the
  PointMaxx Chrome extension at PayPal and Venmo checkout.

## Run it

You need Node 18 or newer and a free PayPal developer account. Everything runs in PayPal's **sandbox**: no real money.

1. **Make a sandbox business account.** On [developer.paypal.com](https://developer.paypal.com), with the toggle on
   **Sandbox**, go to Testing Tools → Sandbox Accounts → Create account → **Business**, **United States**.
   Make a new one even if PayPal already made one for you: the automatic account may never get permission to save
   cards (you'd see HTTP 403 NOT_AUTHORIZED when adding a card).
2. **Make an app on it.** Apps & Credentials → Create App → **Merchant**, and pick the account from step 1. In the
   app's **Features**, make sure **Save payment methods** and **Advanced Credit and Debit Card Payments** are ticked,
   then click **Save Changes**.
3. **Add the keys.**
   ```bash
   git clone https://github.com/arnavgannamani/pointmaxx-agentpay.git
   cd pointmaxx-agentpay
   cp .env.example .env   # then paste the app's Client ID and Secret into .env
   ```
4. **Start AgentPay:** `npm start`, then open http://localhost:4242. (Restart it after editing `.env`.)
5. **Add cards** on the Wallet page with PayPal's test numbers, any future expiry and any CVV:
   `4012 8888 8888 1881` (Visa), `4005 5192 0000 0004` (Visa), `2223 0000 4840 0011` (Mastercard),
   `3714 496353 98431` (Amex, 4-digit CVV). For each, pick which real card it stands for, say Amex Gold or Blue Cash
   Preferred: that's what AgentPay scores. To try a decline, put `CCREJECT-REFUSED` as the name on one card.
6. **Let an agent shop.** In another terminal, run `claude` in the repo folder and allow the `agentpay` tools. Try:
   "Order $40 of dinner from doordash.com, then a $1,249 TV from bestbuy.com." Dinner pays on the best card; the TV
   waits at http://localhost:4242/approvals.

**Get an email when a purchase waits (optional).** Turn on 2-Step Verification for a Google account, make an App
Password at myaccount.google.com/apppasswords, and put `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` (and
`ALERT_EMAIL` to send it somewhere else). Restart AgentPay; it prints where alerts go. Each held purchase then emails
you what the agent tried, why it waited, and a link to the Approvals page.

**No PayPal keys?** `npm run dry` runs everything except the PayPal calls, and starts with three demo cards so there's
something to choose between. Receipts are marked as dry runs.

**Tests:** `npm test` (no PayPal calls).

### If something goes wrong

- **HTTP 403 NOT_AUTHORIZED when saving a card:** the app's business account can't save cards. Check step 2's
  features; if they're on, do steps 1 and 2 again with a new account and put the new keys in `.env`.
- **"Port 4242 is already in use":** AgentPay is already running in another terminal.
- **A receipt says "unknown":** AgentPay stopped (a crash or restart) while PayPal was charging. Check the sandbox
  business account's activity before paying again.

### What the rules guarantee

The rules hold for an agent that reaches AgentPay through its MCP tools. An agent that can also run shell commands on
the same computer could edit AgentPay's files in `data/` directly, so give it the MCP tools only, or run it as another
user or in a container.

## The demo (under 3 minutes)

1. A person asks Claude: "Order dinner from the demo restaurant, and restock groceries from the demo market."
2. Claude calls AgentPay. Dinner goes on the Amex Gold (6%), groceries on the Blue Cash Preferred (6%), each paid
   through PayPal in the sandbox.
3. A $300 electronics order trips the policy: it pauses, the person approves it on the Approvals page, and it
   completes on the card that earns most there.
4. The receipts page: "Your agent earned $X more than your default card this month."

## Status

Working in the PayPal sandbox: wallet, card choice, spending rules, approvals, receipts, the MCP server and the
simulation. See [docs/PLAN.md](docs/PLAN.md) for what's left and [docs/SIMULATION.md](docs/SIMULATION.md) for the
numbers.

## License

MIT, see [LICENSE](LICENSE). The rewards engine and card data come from PointMaxx (pointmaxx.app); card data includes
CardPin (MIT).
