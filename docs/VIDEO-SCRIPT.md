# CardBuddy demo video: voiceover script

Target: **2:55** (the hackathon limit is under 3:00). About 370 words of narration, a comfortable pace.
Spoken lines are in quotes; *[on screen]* notes say what's shown. "Footage 0:36" means that timestamp in the screen
recording `demo-video/cardbuddy-demo.mp4` (1:50, 1920×1080, real PayPal sandbox results, no audio).

## 1. Cold open: the hook (0:00–0:10)
*[Footage 1:01–1:08, chat: "also get me that 65-inch TV", agent replies that it's held. Zoom in on "held for your
approval."]*
> "My AI agent just tried to spend thirteen hundred dollars on a TV. And it couldn't, because CardBuddy stopped it."

## 2. You two (0:10–0:20)
*[Face clip: both founders, one line each]*
> **Arnav:** "I'm Arnav."
> **Mihir:** "And I'm Mihir. We built PointMaxx, which helps people pick credit cards from their real spending."

## 3. The problem (0:20–0:36)
*[Text on a plain background: two numbers appear one at a time]*
> "AI agents are starting to shop for us, and two things go wrong. They pay with whatever card you hand them, so the
> rewards you chose your cards for disappear. And nothing checks what they buy: a double order, the wrong item, a flight
> on the wrong day all just go through."

*[On screen: "~2% of every dollar in rewards, lost" · "$1,957 of agent mistakes, unchecked, in one simulated year"]*

## 4. What CardBuddy is (0:36–0:46)
*[Footage 0:00–0:04 title card, or a simple diagram: Agent → CardBuddy → PayPal]*
> "CardBuddy is a payment layer for AI agents on PayPal. Your agent shops. CardBuddy picks the card that earns the most,
> and keeps the rules you set."

## 5. Adding cards (0:46–1:08)
*[Footage 0:04–0:36: PayPal card fields, then "Where each card wins"]*
> "First, you add your cards, through PayPal's own card fields, so the card number goes straight to PayPal's vault.
> CardBuddy never sees it. You tell it which card is which, and right away it shows where each one wins: the Amex Gold
> for dining, the Blue Cash Preferred for groceries, your Double Cash everywhere else."

## 6. The agent shops (1:08–1:34)
*[Footage 0:36–1:01, chat: "Can you order my weekly groceries?", then "and pad thai for dinner tonight". Zoom in on the
"+$3.45" result card, then "+$1.48". The on-screen caption says the shops are demo stores standing in for PayPal
merchants.]*
> "Then you just text your agent. No prices, no card numbers. It finds my groceries at the store, and CardBuddy puts them
> on the Blue Cash Preferred: six percent back, three forty-five more than my default card. Dinner goes on the Amex Gold.
> Each one is a real PayPal order, charged to the vaulted card, without me lifting a finger."

## 7. The held purchase (1:34–2:00)
*[Footage 1:01–1:33: TV held → Approvals page → Approve → agent confirms. Insert the phone email clip here if there is
one.]*
> "Now the TV. It's over my hundred-dollar limit, so CardBuddy holds it and I get an email. Nothing is charged until I
> say so. I approve, and it pays. On electronics no card in my wallet beats two percent, so it uses my default. CardBuddy
> only switches cards when it actually earns you more."

## 8. Receipts (2:00–2:12)
*[Footage 1:32–1:44, Receipts. Zoom in on "+$4.93" and one PayPal order id.]*
> "Every purchase gets a receipt: the card it used, what it earned against my default, and the PayPal order behind it."

## 9. How it's built (2:12–2:32)
*[A simple slide: four short lines appear one by one]*
> "Under the hood: PayPal's Vault API stores the cards, and the Orders API charges them while you're away. If a card is
> declined, the next best one pays. The rules live on CardBuddy's server, not in the agent, so the agent can read them
> but never change or skip them. And it connects over MCP, so any AI agent can use it."

*[On screen: "PayPal Vault v3 · Orders v2 · automatic fallback · rules on the server · MCP"]*

## 10. Impact (2:32–2:46)
*[Footage from the Simulation page, or a numbers card]*
> "We simulated a full year of agent shopping: three hundred twenty-nine purchases. CardBuddy earned four hundred fifty
> dollars more than the default card, more than double, and caught every one of the agent's mistakes."

## 11. Close (2:46–2:55)
*[Face clip, then end card: "CardBuddy by PointMaxx", repo link, "Built on PayPal (sandbox)"]*
> "CardBuddy. Your agent shops. CardBuddy picks the card and keeps your rules."

## Editing notes

- The footage is 1:50 and the script uses about 1:40 of it: trim the end card and part of the second "sped up" card
  section.
- Burn in captions for every line: many judges watch muted.
- Zoom in on: "held for your approval", "+$3.45", the Approvals reason, the email, one PayPal order id, "+$4.97".
- The email alert isn't in the footage (alerts were off for the recording). Once Gmail alerts work, record 3 seconds of
  the phone getting "Your agent wants to spend $1,249.00 at …" and drop it into section 7. Without it, say "and it can
  email me" instead.
- The numbers in sections 3 and 10 come from [SIMULATION.md](SIMULATION.md). Say "in our simulation"; never present
  them as user data.
- Hackathon rules: no music unless royalty-free and licensed, no logos or card art. Upload to YouTube as public.
- Face time stays around 10–15%: sections 2 and 11 only. One narrator for every other line.

## The real results in the footage

From the recording run (PayPal sandbox, Nov 4 v2: the agent finds each item in the demo store with `search_store` and
pays with `checkout`; the person never says a price). The first version, with prices in the texts, is kept as
`demo-video/cardbuddy-demo-v1.mp4`.

| Purchase | Demo store | Total | Card CardBuddy picked | Back | Earned vs default | PayPal order |
|---|---|---:|---|---:|---|---|
| Weekly grocery basket | Greenleaf Market | $86.40 | Amex Blue Cash Preferred | 6% | $5.18 vs $1.73 (+$3.45) | 8YR24026TU583144K |
| Pad thai dinner for two | Night Owl Kitchen | $37.01 (tax, delivery) | Amex Gold | 6% | $2.22 vs $0.74 (+$1.48) | 8S8894124C658172F |
| 65-inch 4K TV, held, then approved | Voltline Electronics | $1,348.92 (tax) | Citi Double Cash (the default) | 2% | $26.98, same as default | 9RJ38521D76827206 |

Totals: $34.38 in rewards, +$4.93 over the default card. The TV was held because "$1,348.92 is over the $100.00
per-purchase limit".
