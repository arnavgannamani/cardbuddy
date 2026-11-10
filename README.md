# CardBuddy

**A card-aware payment layer for AI agents on PayPal.** When an agent buys something, CardBuddy picks the card in
your PayPal wallet that earns the most on that purchase, checks it against the spending rules you set, and pays through
the PayPal Orders API. If the purchase is outside your rules it waits for your approval instead, and emails you. Every
purchase leaves a receipt that shows what the right card earned versus your default.

Built for the PayPal AI Hackathon (Nov 2026) by Arnav Gannamani and Mihir Argulkar.

- **Live demo, nothing to install:** https://pointmaxx-cardbuddy.onrender.com ([how to use it](#live-demo))
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
   website, or from its name for a store it doesn't know) and runs every card in your wallet through its
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
 AI agent ── MCP tools ──► CardBuddy server ──► best card (rewards engine)
 (any MCP client)          │                  ──► your spending rules ──► held? ──► Approvals page + email
                           │                                                         (you approve or decline)
                           └──► PayPal Orders API, paid with the chosen card's vault token ──► receipt
 You ── Wallet page ── PayPal card fields ──► PayPal Vault (CardBuddy keeps only the token)
```

## Live demo

**https://pointmaxx-cardbuddy.onrender.com**: open it in any browser, no sign-in needed.

> **This is one shared demo, not your own account.** Everyone who opens the link sees the same wallet, the same
> spending rules, the same held purchases and the same receipts. If someone else used it before you, you may see their
> purchases, or rules they changed. Per-person accounts (each person signing in with their own PayPal wallet) are on
> the [What's next](#whats-next) list.

**Start here so you see what we see:**

1. On the **Wallet** page, click **Run the demo agent**. It clears the last visitor's purchases (they're archived, not
   deleted), puts the spending rules back to the defaults ($100 per purchase, $500 a month, travel always needs
   approval), and plays the purchases from our video: groceries and dinner are paid on the card that earns the most,
   and a $1,348.92 TV and a hotel the agent labelled "other" are held.
2. Open **Approvals** to approve or decline the held purchases. Each says why it was held.
3. Open **Receipts** to see the card each purchase used, what it earned against the default card, and its PayPal order
   id.

Click **Run the demo agent** again any time to start over. It's on Render's free tier, so the first visit after a quiet
spell can take about a minute to wake up, and a restart clears the history (one click on the button brings it back).
The demo's cards can't be removed, since that would delete them from PayPal's sandbox vault for everyone.

**To connect your own AI agent** to the live demo: point any MCP client at
`https://pointmaxx-cardbuddy.onrender.com/mcp` with the header `Authorization: Bearer <key>`, using the key in our
Devpost testing instructions. It shops in the same shared wallet. For a wallet that's only yours, run CardBuddy on your
own computer (next section): it takes two minutes and needs no PayPal account.

## Try it in 2 minutes

No PayPal account needed: dry-run mode does everything except the PayPal calls, and starts with three demo cards
(Citi Double Cash as the default, Amex Gold, Amex Blue Cash Preferred).

```bash
git clone https://github.com/arnavgannamani/cardbuddy.git
cd cardbuddy
npm run dry
```

Open http://localhost:4242: the Wallet page shows where each card wins. Then let an agent shop (next section), and
watch Receipts and Approvals fill in. Node 18 or newer; there are no packages to install.

## Let an agent shop

CardBuddy's MCP server is `mcp/server.mjs`. It has eight tools: `get_wallet`, `recommend_card`, `search_store`,
`checkout`, `pay`, `purchase_status`, `list_receipts` and `spending_rules`. The agent can read your rules but has no tool
to change them or to approve its own purchases.

**The demo store.** You shouldn't have to know what things cost. CardBuddy comes with four fictional shops standing in
for the PayPal merchants an agent buys from: Greenleaf Market (groceries), Night Owl Kitchen (restaurant delivery),
Voltline Electronics and Skyline Air (flights). See them at http://localhost:4242/store. The agent searches them
(`search_store`), checks out a cart (`checkout`), and the shop works out the total with tax and delivery; CardBuddy then
pays that total on the best card, or holds it. If you give a limit ("keep it under $50"), a total above it waits for
you. With real merchants, the total comes from the merchant's own PayPal checkout instead.

- **Claude Code:** open a session in the repo folder. `.mcp.json` connects the `cardbuddy` tools; allow them when asked.
- **Any other MCP client:** add a server that runs `node /path/to/cardbuddy/mcp/server.mjs` with the
  environment variable `CARDBUDDY_URL=http://localhost:4242`.

Then ask it, for example: *"Order my weekly groceries, get pad thai for dinner tonight, and buy that 65-inch TV."* It
finds each in the demo store and checks out: groceries go on the Blue Cash Preferred (6%), dinner on the Amex Gold, and
the TV waits at http://localhost:4242/approvals because it's over the $100 per-purchase limit. For a store outside the
demo, give the amount yourself: *"Pay $38 for dinner on doordash.com."*

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

**Tests:** `npm test` runs the card choice, decline fallback, alert, end-to-end agent and hosted tests. None call PayPal.

**No agent handy?** The wallet page has a **Run the demo agent** button: it plays the video's purchases (groceries,
dinner, a TV and a hotel the agent mislabels) and starts a clean history each time, keeping the old one in
`data/archive-<time>.json`, with the spending rules back at their defaults. With sandbox keys the two paid purchases are real PayPal sandbox orders; in dry run
(`npm run dry`) PayPal is never called.

## Host it, so agents in other apps can connect

Agents that run in the cloud (Muse, ChatGPT and claude.ai connectors, anything that takes an MCP server URL) can't reach
your laptop. Hosted, CardBuddy serves the same eight tools at `https://<your host>/mcp` (MCP over Streamable HTTP), and
the agent sends an API key, which opens only the agent's tools: it can't approve a purchase or change a rule. The pages
can sit behind a password; without one they're an open demo anyone with the address can click through, and its cards
can't be removed (that would delete them from PayPal's vault for everyone). Still sandbox only.

**Quickest: the Render Blueprint.** `render.yaml` sets up the hosted demo in dry-run mode (PayPal is never called),
with no page password (an open demo) and Render generating the agent's API key; the address comes from Render's
`RENDER_EXTERNAL_URL`. On Render: New → Blueprint → this repo. Find the key under the service's Environment tab. The wallet page's **Run the demo agent** button plays the purchases from the video, so you can see
CardBuddy work without connecting an agent. Add the sandbox app's `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` and
remove `CARDBUDDY_DRY_RUN` to make them real PayPal sandbox orders.

**Or by hand:**

1. **Make a key, and a password if the pages shouldn't be open:** run `openssl rand -hex 16`.
2. **Deploy** on any Node host. On [Render](https://render.com): New → Web Service → this repo, start command
   `node server.mjs`, then these environment variables:

   | Variable | Value |
   |---|---|
   | `CARDBUDDY_PUBLIC_URL` | The service's address, e.g. `https://cardbuddy.onrender.com` (on Render it's set for you) |
   | `CARDBUDDY_KEY` | From step 1: the agent's API key |
   | `CARDBUDDY_PASSWORD` | Optional: what you type to open the pages. Leave it out for an open demo |
   | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | The sandbox app's keys, or `CARDBUDDY_DRY_RUN=1` for no PayPal at all |
   | `CARDBUDDY_WALLET` | Optional: the cards to start with, from `node -e "console.log(JSON.stringify(require('./data/wallet.json')))"` |

   A free host's disk is wiped on every restart: the wallet comes back from `CARDBUDDY_WALLET`, receipts and held
   purchases start empty. The vault tokens in it only work with the same PayPal app's keys.
3. **Connect the agent** to `https://<your host>/mcp` with the header `Authorization: Bearer <CARDBUDDY_KEY>`.
   Approvals and their email links go to `https://<your host>/approvals`.

To try it from your own computer first, start CardBuddy with those variables and put a tunnel in front of it, e.g.
`ngrok http 4242`, using the tunnel's address as `CARDBUDDY_PUBLIC_URL`.

## PayPal APIs used

| What | PayPal API | Where |
|---|---|---|
| Card entry without the number touching CardBuddy | JS SDK **Card Fields** (`components=card-fields`), vault without purchase | `web/connect.js` |
| Saving cards | **Vault API v3**: setup tokens, then payment tokens; delete on remove | `src/paypal.mjs` |
| Paying while the person isn't there | **Orders API v2**: `payment_source.card.vault_id` with `stored_credential` (merchant-initiated, unscheduled, subsequent), then capture | `src/paypal.mjs` |
| Auth | OAuth 2.0 client credentials (sandbox) | `src/paypal.mjs` |

## How CardBuddy picks the card

For every purchase, CardBuddy scores each card in the wallet and pays with the one that earns the most
(`src/choose.mjs`, using the rewards engine in `engine/`).

1. **Find the category.** A store CardBuddy knows (`engine/stores.json`) has a fixed category. For any other store the
   agent says the category, and CardBuddy also reads the store's name itself (keyword rules, then the trained model
   under [AI used](#ai-used)) as a check for the spending rules.
2. **Find each card's rate there** (`engine/pick.cjs`, `rateFor`). It starts from the card's base rate and takes the
   highest that applies:
   - the card's bonus rate for that category (say 6% on groceries);
   - a choose-your-category or top-category bonus (cards like Citi Custom Cash);
   - a rotating quarterly bonus, using this quarter's categories (cards like Chase Freedom Flex);
   - a bonus at named brands, matched on the store's name (say 3x on flights booked directly with an airline).
3. **Turn points into dollars.** Each card's rate is multiplied by what its points are worth (cents per point; 1 for
   cash back), so a 4x points card and a 6% cash card compare fairly.
4. **Pick the winner.** The highest percent back wins. A tie goes to cash back over points, since cash is certain. The
   receipt compares it with what the default card would have earned.
5. **Check the PayPal rails too.** CardBuddy also scores paying through the PayPal wallet or Venmo, where some cards earn
   a checkout bonus (the PayPal Cashback Mastercard's 3% at PayPal checkout), and says so when a rail would earn more.
6. **Pay, or fall back.** CardBuddy charges the winner's vault token through the Orders API. If PayPal declines it, the
   next-best card pays, and the receipt says which card was declined.

**The card data** (`engine/cards.json`): 56 US cards fully researched and scored, each with its earn rates, caps,
rotating categories, point value, annual fee and a link to the issuer's terms with the date it was checked. Spending
caps come back with each pick (`recommend_card`); CardBuddy doesn't yet count spending against them, so a card stays at its bonus rate after
its cap would have run out.

## AI used

**An AI agent is the shopper.** Claude, or any agent that speaks the Model Context Protocol, shops through CardBuddy's
eight MCP tools (`mcp/server.mjs`, or `/mcp` over Streamable HTTP when hosted). The agent can search the store, check
out, pay and read the rules and receipts, but it has no tool to change the rules or approve its own purchases.

**A trained model double-checks the agent.** When an agent buys from a store CardBuddy doesn't know, the agent says
which category it is, and a wrong category could skip a rule (a hotel called "other" would dodge "travel always needs
my OK"). So CardBuddy reads the store's name itself, and if its reading disagrees with the agent's, the spending rules
check both. Example: an agent pays $89 at "Seaside Lodge" as "other"; the model reads it as travel, and the purchase
waits with the reason "CardBuddy reads SEASIDE LODGE as travel, and travel purchases always need your approval".

| | |
|---|---|
| Model | Character 3–5-gram TF-IDF (within words) with logistic regression, 11 categories, 20,000 features |
| Training data | 964,618 government purchase-card transactions at 221,058 merchant names (Indiana and Delaware open data), labelled by merchant category code |
| Trained with | Python, scikit-learn, pandas, numpy; the weights ship in `engine/category-model.json` and run in plain JavaScript, with no ML library at runtime |
| How it's used | Keyword rules first; the model only counts when it is at least 90% sure (`engine/engine.cjs`, `categoryInfo`). CardBuddy uses its reading as a second opinion on the agent's category (`src/choose.mjs`, `src/policy.mjs`) |
| Measured | On 407,011 Oklahoma purchases it never trained on, rules plus the model put 91.7% of purchases in the right category, against 84.3% for the rules alone |

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

**What came from elsewhere:** the rewards engine and card data (`engine/`) come from a card recommender we started on
Oct 23, 2026, during the submission period but as a separate product. CardBuddy uses them as a library to score
cards.

## What's next

- **Personal shopping agents at PayPal merchants.** PayPal already lets people check out with personal AI agents such
  as Meta's Muse at PayPal merchants: the agent finds the product and the merchant's checkout supplies the total.
  CardBuddy is the layer between that agent and the person's PayPal wallet: it picks the card that earns the most and
  enforces their rules, so they approve only what's unusual instead of every purchase. The demo store stands in for
  those merchants today.
- Sign-in for each person (OAuth), so the hosted connector serves many wallets instead of one demo wallet.
- Paying through PayPal and Venmo balances where their cards earn more.

## License

MIT, see [LICENSE](LICENSE). The rewards engine and card data come from our card recommender; card data includes
CardPin (MIT, see `engine/CARDPIN-LICENSE.txt`).
