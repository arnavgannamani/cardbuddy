# Build plan

Deadline: **Thu Nov 12, 12:00 pm Pacific**. Aim to submit **Wed Nov 11**.

## Why this can win

Judging is equal parts technical implementation, design, impact, innovation and presentation, after a pass/fail check
that PayPal's developer platform and an AI tool are both central.

- **PayPal is the core, not an add-on:** PayPal Vault for the wallet, the Orders API for every payment, PayPal and Venmo
  checkout bonuses in the card choice, and PayPal approval for anything outside the policy.
- **AI is the user:** an agent (Claude, over MCP) does the shopping; AgentPay is what makes that safe and smart.
- **It targets the "Best Use of Agentic Commerce" prize head-on,** and fills two real gaps in agent payments: agents
  pay with the default card, and payment tools have no built-in confirmation step.
- **A clear, measurable story for the video:** "your agent earned $X more", with real card math from an engine that
  already ships (pointmaxx.app, a Chrome extension, an MCP server on npm and the official MCP Registry).

## Architecture

```
Claude / any MCP agent ──► agentpay-mcp ──► policy check ──► card choice (PointMaxx engine)
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

## Days

| Day | Work | Owner |
|---|---|---|
| Tue Nov 3 | Agree the idea. PayPal sandbox app with Vault and Advanced Checkout enabled. Devpost team. | Both |
| Wed Nov 4 | Spike: vault a sandbox card with Card Fields, then create and capture an order with its vault ID. This is the riskiest part, so do it first. | Claude + Arnav |
| Thu Nov 5 | Card choice: purchase → category → best vaulted card, including PayPal/Venmo checkout bonuses. Tests. | Claude |
| Fri Nov 6 | MCP tools (`wallet`, `choose_card`, `pay`, `approve`, `receipts`) and the spending policy. | Claude |
| Sat Nov 7 | Web pages: connect wallet, receipts. Demo store. | Mihir + Claude |
| Sun Nov 8 | End-to-end run in Claude Desktop. Fix what breaks. | Both |
| Mon Nov 9 | Stretch: extension at PayPal/Venmo checkout. README run steps. Hosted demo. | Mihir |
| Tue Nov 10 | Record the video (under 3 min). Devpost write-up. Make the repo public. | Both |
| Wed Nov 11 | Final check from a clean clone, then submit. | Arnav |

## Open questions (answer in the Wed spike)

1. **Paying with a saved card without the person present.** Orders v2 can save cards to the vault and reuse their vault
   ID, but merchant-initiated charges may need extra setup or approval on PayPal's side. If the sandbox won't allow it,
   the fallback is: AgentPay creates the order and sends the person a PayPal approval link with the recommended card
   named. That still demos the card choice and the policy, just with one tap per purchase.
2. **Venmo in the sandbox.** PayPal's docs say Venmo is not fully supported in the sandbox. Plan to show the Venmo
   Card's 3% in the card choice and receipts, and use PayPal for the actual sandbox payments.
3. **Which card is which.** The vault returns the brand and last four digits, not the product (Gold vs Platinum). The
   person names each card once when they connect it.

## Rules

- PayPal **sandbox** only. Never live credentials, never real cards.
- Card numbers only ever go into PayPal's own card fields. Our code stores vault tokens and card names, nothing else.
- Secrets live in `.env` (git-ignored). Commit an `.env.example` with names only.
- The repo goes public with an open-source license before submission (a Devpost rule), so nothing private goes in it.
