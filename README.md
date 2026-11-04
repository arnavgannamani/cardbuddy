# CardBuddy

**A card-aware payment layer for AI agents on PayPal.** When an agent buys something, CardBuddy picks the card in
your PayPal wallet that earns the most on that purchase, checks it against the spending rules you set, and pays through
the PayPal Orders API. If the purchase is outside your rules it waits for your approval instead, and emails you. Every
purchase leaves a receipt that shows what the right card earned versus your default.

Built for the PayPal AI Hackathon (Nov 2026) by Arnav Gannamani and Mihir Argulkar.

- **Try it in 2 minutes, no PayPal account:** [below](#try-it-in-2-minutes)
- **Run it with real PayPal sandbox payments:** [full setup](#run-it-with-paypal-sandbox-payments)
- **The numbers:** [a simulated year of agent purchases](#the-numbers)

## The problem

Agents are starting to shop: PayPal ships an Agent Toolkit and a hosted MCP server so agents can create and capture
orders. But an agent pays with whatever card it's given. People who pick cards carefully (6% on groceries here, 4x on
dining there) lose all of it the moment an agent takes over the checkout. And an agent with payment tools can spend with
no confirmation step: a duplicate order, the wrong item, a flight on the wrong date all go straight through.

## What CardBuddy does

1. **Your wallet, in PayPal.** You save your cards to PayPal's vault once, through PayPal's own card fields: CardBuddy
   never sees a card number. It stores only PayPal's vault tokens and which card each one is (say "Amex Gold").
2. **The right card, every time.** Before any payment, CardBuddy works out the purchase's category (from the store's
   website, or from its name for a store it doesn't know) and runs every card in your wallet through the PointMaxx
   rewards engine: rates, caps, rotating categories and point values for 50+ US cards. It pays with the card that earns
   the most.
3. **Rules the agent can't skip.** You set a per-purchase limit, a monthly budget, and categories that always need your
   approval. CardBuddy also holds a purchase that repeats one at the same store within 24 hours, one that adds up past
   the limit with others at that store within an hour (a split order), and one from a store with a purchase already
   waiting. Held purchases wait on the Approvals page, with an email to your phone if you turn alerts on.
4. **Pays through PayPal.** CardBuddy creates and captures the order with the PayPal Orders API using the chosen card's
   vault token. If that card is declined, the next-best card pays and the receipt says so.
5. **A rewards receipt.** Each purchase shows the card used, what it earned, what your default card would have earned,
   and the PayPal order id.

```
 AI agent ── MCP tools ──► CardBuddy server ──► best card (PointMaxx engine)
 (any MCP client)          │                  ──► your spending rules ──► held? ──► Approvals page + email
                           │                                                         (you approve or decline)
                           └──► PayPal Orders API, paid with the chosen card's vault token ──► receipt
 You ── Wallet page ── PayPal card fields ──► PayPal Vault (CardBuddy keeps only the token)
```

## Try it in 2 minutes

No PayPal account needed: dry-run mode does everything except the PayPal calls, and starts with three demo cards
(Citi Double Cash as the default, Amex Gold, Amex Blue Cash Preferred).

```bash
git clone https://github.com/arnavgannamani/pointmaxx-agentpay.git
cd pointmaxx-agentpay
npm run dry
```

Open http://localhost:4242: the Wallet page shows where each card wins. Then let an agent shop (next section), and
watch Receipts and Approvals fill in. Node 18 or newer; there are no packages to install.

## Let an agent shop

CardBuddy's MCP server is `mcp/server.mjs`. It has six tools: `get_wallet`, `recommend_card`, `pay`,
`purchase_status`, `list_receipts` and `spending_rules`. The agent can read your rules but has no tool to change them or
to approve its own purchases.

- **Claude Code:** open a session in the repo folder. `.mcp.json` connects the `cardbuddy` tools; allow them when asked.
- **Any other MCP client:** add a server that runs `node /path/to/pointmaxx-agentpay/mcp/server.mjs` with the
  environment variable `CARDBUDDY_URL=http://localhost:4242`.

Then ask it, for example: *"Order my weekly groceries from wholefoodsmarket.com, about $86. Then get dinner from
doordash.com for $38, and a $1,249 TV from bestbuy.com."* Groceries go on the Blue Cash Preferred (6%), dinner on the
Amex Gold, and the TV waits at http://localhost:4242/approvals because it's over the $100 per-purchase limit.

## Run it with PayPal sandbox payments

Everything runs in PayPal's **sandbox**: no real money, test cards only.

1. **Make a sandbox business account.** On [developer.paypal.com](https://developer.paypal.com), with the toggle on
   **Sandbox**, go to Testing Tools → Sandbox Accounts → Create account → **Business**, **United States**.
   Make a new one even if PayPal already made one for you: the automatic account may never get permission to save
   cards (you'd see HTTP 403 NOT_AUTHORIZED when adding a card).
2. **Make an app on it.** Apps & Credentials → Create App → **Merchant**, and pick the account from step 1. In the
   app's **Features**, tick **Save payment methods** and **Advanced Credit and Debit Card Payments**, then **Save
   Changes**.
3. **Add the keys.** `cp .env.example .env`, then paste the app's Client ID and Secret into `.env`.
4. **Start CardBuddy:** `npm start`, then open http://localhost:4242. Restart it after editing `.env`.
5. **Add cards** on the Wallet page with PayPal's test numbers, any future expiry, any CVV, any name:
   `2223 0000 4840 0011` (Mastercard), `4012 0000 3333 0026` (Visa), `4012 8888 8888 1881` (Visa). For each, pick
   which real card it stands for (say Citi Double Cash, Amex Gold, Blue Cash Preferred): that's what CardBuddy scores.
   To try a decline and watch the next-best card pay, put `CCREJECT-REFUSED` as the name on one card.
6. **Let an agent shop**, as above. Receipts show each payment's PayPal order id, which you can find in the sandbox
   business account's activity.

**Email when a purchase waits (optional).** Turn on 2-Step Verification for a Google account, make an App Password at
myaccount.google.com/apppasswords, and put `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` (and `ALERT_EMAIL` to send
it somewhere else). Restart; CardBuddy prints where alerts go.

**Start a clean history:** `npm run reset` moves receipts, held purchases and declines into `data/archive/` and keeps
your wallet and rules. It refuses while a payment's result is unknown.

**Tests:** `npm test` runs the card choice, decline fallback, alert and end-to-end agent tests. None call PayPal.

## PayPal APIs used

| What | PayPal API | Where |
|---|---|---|
| Card entry without the number touching CardBuddy | JS SDK **Card Fields** (`components=card-fields`), vault without purchase | `web/connect.js` |
| Saving cards | **Vault API v3**: setup tokens, then payment tokens; delete on remove | `src/paypal.mjs` |
| Paying while the person isn't there | **Orders API v2**: `payment_source.card.vault_id` with `stored_credential` (merchant-initiated, unscheduled, subsequent), then capture | `src/paypal.mjs` |
| Auth | OAuth 2.0 client credentials (sandbox) | `src/paypal.mjs` |

## The numbers

A reproducible simulated year (`node sim/simulate.mjs`, seed 20261112): 329 agent purchases, $21,227.56, the same three
cards both ways. Full method and caveats in [docs/SIMULATION.md](docs/SIMULATION.md); the Simulation page shows it.

- **Rewards: $875.54 with CardBuddy vs $424.55 on the default card: +$450.99 (+106%)**, against a 2%-everywhere
  default. With a typical 1% default card the gap is larger.
- **Mistakes:** the agent's three planted mistakes (a duplicate grocery order, a $1,249 TV instead of a TV mount, a
  flight on the wrong date) would spend $1,957.12 unchecked. CardBuddy holds all three.

## Security and privacy

- Card numbers go from PayPal's card fields straight to PayPal. CardBuddy stores vault tokens and card names only.
- PayPal keys live in `.env` (git-ignored) on the CardBuddy server, never in the agent's MCP server.
- Rules are checked on the server before any card is charged; one payment at a time; a payment interrupted mid-way is
  kept as "unknown" rather than retried, so nothing is charged twice.
- The rules hold for an agent that reaches CardBuddy through its MCP tools. An agent that can also run shell commands
  on the same computer could edit `data/` directly, so give it the MCP tools only, or run it as another user or in a
  container.

### If something goes wrong

- **HTTP 403 NOT_AUTHORIZED when saving a card:** the app's business account can't save cards. Check step 2's
  features; if they're on, repeat steps 1 and 2 with a new account and put the new keys in `.env`.
- **A test card is declined when saving or paying:** PayPal's sandbox declines some test numbers. Use another from the
  list above.
- **"Port 4242 is already in use":** CardBuddy is already running in another terminal.
- **A receipt says "unknown":** CardBuddy stopped while PayPal was charging. Check the sandbox business account's
  activity before paying again.

## Built during the hackathon

The submission period opened Oct 1, 2026; this repository was started on Nov 3, 2026 and everything in it was built
for the hackathon: the PayPal wallet, payments and decline fallback, the spending rules and approvals, email alerts, the
agent's MCP server, the web app, the simulation and the tests.

**What existed before:** the PointMaxx rewards engine and card data (`engine/`), from pointmaxx.app, our card
recommender. CardBuddy uses them as a library to score cards.

## What's next

A hosted connector so agents in other apps can use CardBuddy without running it locally; paying through PayPal and
Venmo balances where their cards earn more; and the PointMaxx Chrome extension at PayPal checkout.

## License

MIT, see [LICENSE](LICENSE). The rewards engine and card data come from PointMaxx (pointmaxx.app); card data includes
CardPin (MIT, see `engine/CARDPIN-LICENSE.txt`).
