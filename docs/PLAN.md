# Build plan

Deadline: **Thu Nov 12, 12:00 pm Pacific**. Aim to submit **Wed Nov 11**.

## Why this can win

Judging is equal parts technical implementation, design, impact, innovation and presentation, after a pass/fail check
that PayPal's developer platform and an AI tool are both central.

- **PayPal is the core, not an add-on:** PayPal Vault for the wallet, the Orders API for every payment, PayPal and Venmo
  checkout bonuses in the card choice, and PayPal approval for anything outside the policy.
- **AI is the user:** an agent (Claude, over MCP) does the shopping; CardBuddy is what makes that safe and smart.
- **It targets the "Best Use of Agentic Commerce" prize head-on,** and fills two real gaps in agent payments: agents
  pay with the default card, and payment tools have no built-in confirmation step.
- **A clear, measurable story for the video:** "your agent earned $X more", with real card math from an engine that
  already ships (pointmaxx.app, a Chrome extension, an MCP server on npm and the official MCP Registry).

## Architecture

```
Claude / any MCP agent ──► cardbuddy-mcp ──► policy check ──► card choice (PointMaxx engine)
                                                    │                   │
                                       needs approval?            vault token
                                                    ▼                   ▼
                                     PayPal approval link       PayPal Orders API (sandbox)
                                                                        │
                                                                   receipt log
```

- `engine/`: the PointMaxx rewards engine and card data, as a dependency (reuse `pointmaxx-mcp`'s `lib/`).
- `server/`: a small Node server that holds the PayPal credentials (sandbox client ID and secret, from env), creates
  and captures orders, vaults cards, and keeps the receipt log. Card numbers never reach it: PayPal's card fields
  tokenize them in the browser.
- `mcp/`: the agent-facing MCP server, calling `server/`.
- `web/`: two pages: "Connect your wallet" (PayPal card fields + which card each one is), and "Receipts".
- `extension/` (stretch): PayPal/Venmo checkout detection in the existing PointMaxx extension.
- A demo store with a few sandbox merchants (restaurant, grocery, electronics) so the purchases have real categories.

## Done (as of Tue Nov 3)

- Wallet: cards vaulted with PayPal Card Fields (Vault v3); make default, remove.
- Unattended payments: Orders v2 with the vault ID and stored-credential flags; works in the sandbox.
- Card choice per purchase from the PointMaxx engine, with automatic fallback to the next-best card on a decline.
- Spending rules (per purchase, monthly budget, always-ask categories); held purchases; approve or decline.
- Receipts against the default card; the simulation page (a year of purchases: +$450.99, +106%).
- The agent's MCP server (`mcp/server.mjs`, connected by `.mcp.json`): get_wallet, recommend_card, pay,
  purchase_status, list_receipts, spending_rules. The agent can read the rules but not change them.
- Dry-run mode (`npm run dry`) and an end-to-end test of the agent flow that never calls PayPal.
- Store rules: the same amount at the same store within 24 hours, purchases at one store within an hour that add up
  past the limit, or a store with a purchase already waiting, all wait for approval. An unknown merchant is also
  checked against the engine's own reading of its name. Payments interrupted by a restart are kept as "unknown".
- Hold alerts by email (`src/notify.mjs`): Gmail with an App Password, sent in the background, off without settings.
- Web app restyled (taste-skill, achromatic ledger in PointMaxx colours), smooth page changes.

Answered: unattended charges work in the sandbox (question 1); the person names each card when vaulting it (question 3).

## Remaining

| When | Work |
|---|---|
| Now | **Name**: CardBuddy (Mihir's pick) vs PointMaxx Route; check it's free (app stores, domain, USPTO). Then rename everywhere. |
| Nov 5 | **One real sandbox run through the agent** (not dry run), for a real PayPal order id in the video. Raise the demo budget to $2,500. |
| Nov 5–6 | **Hardening**: try to break it (bad inputs, PayPal down, server restarted mid-approval, two approvals at once, empty wallet) and fix what breaks. |
| Nov 6–7 | **Hosted demo** so anyone can try it without installing. Seed a demo wallet. |
| Nov 7–8 | **README a judge can follow in 5 minutes**: clone, sandbox keys, `npm start`, open in Claude Code. Sandbox credentials safe to share. |
| Nov 8 | **Make the repo public** after scanning git history for secrets; MIT license visible in the About section. Check PayPal Cashback and Venmo card terms before claiming them. Stretch: PayPal/Venmo checkout as a rail. |
| Nov 9–10 | **Video under 3 minutes**, public on YouTube: problem → agent buys groceries, right card pays → TV held, phone buzzes → approve/decline → receipts → simulation. No logos, card art or music. |
| Nov 10 | **Devpost write-up**: problem, how it works, PayPal APIs used, the numbers, tokens saved, and a "built during the hackathon" paragraph. |
| Wed Nov 11 | Final check from a clean clone, then submit. Deadline Thu Nov 12, 12:00 pm PT. |
| Skip unless time | Extension at PayPal checkout. |

## What the official rules require (read Nov 3)

- **Existing work is allowed** if the project was new or significantly updated after Oct 1. CardBuddy is a new repo built
  in the window; the PointMaxx engine and card data existed before. Say so in the write-up.
- **Solely owned by the entrant.** Enter as a Team (Arnav and Mihir). If PointMaxx moves into the LLC before submitting,
  enter as the LLC instead, or move it after Nov 12.
- **Judges must be able to run it**: public repo with an open-source license, plus a hosted demo or complete setup steps
  with any sandbox credentials needed.
- **Video under 3 minutes on YouTube**; no third-party trademarks or copyrighted music without permission. Avoid issuer
  and store logos and card art; card and store names as plain text are a grey area (consider asking Devpost in writing).
- **Judging**: a pass/fail check that PayPal and AI are central, then five equal criteria: technical implementation,
  design, potential impact, innovation, presentation. Judging may be partly AI-assisted, so the README matters.
- We build for the product, not for prizes: a sponsor tool goes in only if it makes CardBuddy better for the person
  using it.

## What "works great" means

- **It never surprises the person.** Every payment is within the rules or waits for them; every receipt says which card
  paid and why; a decline falls back cleanly and says so.
- **It never surprises the agent.** Every tool returns a clear result or a plain error it can act on, never a crash.
- **It runs from a clean clone in 5 minutes,** or from a hosted link with nothing to install.
- **Every number is honest:** rewards from published terms, points at stated values, the simulation reproducible.

## Rules

- PayPal **sandbox** only. Never live credentials, never real cards.
- Card numbers only ever go into PayPal's own card fields. Our code stores vault tokens and card names, nothing else.
- Secrets live in `.env` (git-ignored). Commit an `.env.example` with names only.
- The repo goes public with an open-source license before submission (a Devpost rule), so nothing private goes in it.
