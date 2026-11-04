# CardBuddy demo video

`cardbuddy-demo.mp4`: about 100 seconds, 1920x1080, 30 fps, no audio. A person adds three cards in PayPal's card
fields, texts their AI agent (no prices: "order my weekly groceries", "pad thai for dinner", "that 65-inch TV"), the agent
finds each item in CardBuddy's demo store and checks out through CardBuddy's MCP tools, a $1,348.92 TV (with tax) is
held for approval and then approved, and Receipts shows every purchase with its PayPal order.

Everything in it is real, on the PayPal **sandbox**: the cards are PayPal's sandbox test numbers typed into PayPal's own
card fields; the agent's calls go through `../mcp/server.mjs` (`search_store`, `checkout`, `purchase_status`,
`list_receipts`); the shops (Greenleaf Market, Night Owl Kitchen, Voltline Electronics) are the fictional demo stores
in `../src/shop-catalog.json`, which work out each total with tax and delivery, and a caption says so; the approval is a click on CardBuddy's Approvals page. The chat page is a plain generic thread; its
agent replies are written from the tool results saved in `build/run.json` (item, shop, total, card, percent back,
rewards vs the default card, held reason, PayPal order ids). Nothing is typed in by hand except the person's messages.

## Re-render

Needs Node 18+, Chrome, ffmpeg on the PATH (or `FFMPEG=/path/to/ffmpeg`), and sandbox keys in `../.env`.

```bash
cd demo-video
npm install           # playwright-core only; it drives the installed Chrome
node record.mjs       # ~1.5 min: a throwaway CardBuddy on port 4400, real PayPal sandbox calls, screencast
node render.mjs       # ~4 min: chat and title frames, re-timing, ffmpeg → cardbuddy-demo.mp4
```

- `record.mjs` never touches `../data` or port 4242: it starts its own CardBuddy with `PORT=4400` and
  `CARDBUDDY_DATA` set to a new folder in the OS temp dir, with email alerts off, and stops it and deletes that folder at the end. It sets the
  rules (per purchase $100, monthly budget $2,500) from CardBuddy's page. Each run adds three sandbox cards to PayPal's
  vault and makes three sandbox orders.
- `render.mjs --stills` writes a few chat frames to `build/stills/` to check the look; `render.mjs --serve` serves
  `chat.html` at http://localhost:4410/chat.html, where the thread plays in real time.
- To change the person's messages or the timing, edit the "chat" section of `render.mjs`; to change what is bought,
  edit `BUYS` (the search_store queries) in `record.mjs` and record again.
- `cardbuddy-demo-v1.mp4` is the first cut, from before the demo store (the person said prices; the agent used `pay`).
- `build/` (frames, `run.json`, `shots.json`) is regenerated each run and is git-ignored.
