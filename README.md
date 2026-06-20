# Agent Proxy — pay-per-request egress for AI agents

**Stripe for agent bandwidth.** AI agents get rate-limited, geo-blocked, and
IP-banned the moment they scrape at scale. Agent Proxy turns a proxy/VPN egress
into a **paid service**: an agent pays **USDC per request** over **x402**, routes
its fetch through the proxy's network, and gets back the data plus a receipt —
all from its **Circle Agent Wallet**, under a hard budget.

It's a repeatable workflow where the wallet is part of the job, not a one-off
`send`: discover → inspect price → pay per call → forward → receipt → spend
ledger.

```
┌──────────────────────────┐         x402 / USDC          ┌───────────────────────────┐
│  BUYER  (Claude agent)   │  ── GET /proxy?url=… ───────▶ │  SELLER  (proxy-seller)   │
│  Circle Agent Wallet     │  ◀── 402 challenge ────────── │  @circle-fin/x402-batching│
│  • discover /catalog     │  ── signed USDC payment ────▶ │  • require("$0.001")      │
│  • circle_pay_service    │                               │  • Circle Gateway settles │
│  • $0.05 budget cap      │  ◀── data + x-payment-tx ──── │  • forward via egress IP  │
│  • returns spend ledger  │                               │  • write receipt → ledger │
└──────────────────────────┘                               └───────────┬───────────────┘
        Circle kit (unmodified)                                        │
                                                            live dashboard at /  ◀── tx hashes
```

- **Buyer**: the Circle **Claude Agent SDK** starter kit (`circle-kit/`),
  unmodified — a real autonomous agent whose only tools are the Circle Agent
  Wallet stack. We give it the research-with-a-budget job. See
  [`BUYER.md`](BUYER.md).
- **Seller**: [`proxy-seller/`](proxy-seller/) — Express + Circle's
  `@circle-fin/x402-batching` Gateway middleware. ~1 file of payment glue; the
  rest is the proxy + ledger + dashboard. See
  [`proxy-seller/README.md`](proxy-seller/README.md).

## Why this fits the Circle Agentic Commerce track

Circle's brief: *"go beyond an agent sends USDC once … a repeatable workflow
where the wallet is part of the agent's job: buying data, accessing APIs … and
return a receipt or spend ledger."* This is exactly that — the suggested
**"Developer API Monetization Agent"** and **"Research Agent with a Budget"**,
combined.

| Required element | Where |
| --- | --- |
| Circle Agent Wallet | Buyer's wallet (Circle kit); seller payout wallet |
| A wallet action | `circle_pay_service` (x402 USDC) per fetch; `circle_gateway_deposit` |
| Agent framework starter kit | Circle **Claude Agent SDK** kit, unmodified |
| Service discovery + pricing | Free `/catalog`; `fetch_service` → `inspect` |
| Receipt / tx hash / ledger | `req.payment.transaction` per call → `/ledger` + dashboard |
| Budget / spend cap / policy | Agent enforces a $0.05 cap and refuses + explains over-budget calls |
| Repeatable workflow | N fetches, paid one-by-one, not a single transfer |

## Bounty stack

- **Circle Agentic Commerce** ($1,000) — primary, above.
- **Tavily** ($500) — drop-in: the agent uses Tavily search to *decide which
  sources to fetch*, then pays the proxy to fetch them. Proxy exists to reach web
  data; Tavily picks the targets.
- **Nebius TokenFactory** ($500×2) — run the agent's inference on Nebius; the
  Claude kit's `LLM_MODEL` / provider is swappable.

## Quick start (local, no money)

```bash
cd proxy-seller
cp .env.example .env
echo 'DEV_BYPASS_KEY=letmein' >> .env
npm install && npm start
# in another shell: pay-free forward through the egress IP, logged to the ledger
curl -s -H 'x-dev-bypass: letmein' 'http://localhost:3402/proxy?url=https://api.github.com/zen'
open http://localhost:3402/        # live dashboard
```

Confirm the real x402 rail is armed (unpaid call → 402 challenge):

```bash
curl -s -D - -o /dev/null 'http://localhost:3402/proxy?url=https://example.com' | grep -i payment-required
```

## Full demo (real payments)

1. Run `proxy-seller` on a public URL, Base mainnet (`FACILITATOR_URL=https://gateway-api.circle.com`, `NETWORKS=eip155:8453`).
2. Run the Circle Claude kit buyer and paste the task prompt — full runbook in
   [`BUYER.md`](BUYER.md).
3. Watch the dashboard fill with paid fetches and on-chain tx links while the
   agent prints its budget-capped spend ledger.

## Repo layout

```
.
├── README.md            ← this file
├── BUYER.md             ← buyer agent runbook + task prompt
├── proxy-seller/        ← the paid x402 proxy (seller)
│   ├── src/server.ts    ← routes + payment middleware + forward
│   ├── src/ledger.ts    ← receipts → ledger.jsonl
│   ├── src/dashboard.ts ← live dashboard
│   └── scripts/buyer.ts ← non-AI testnet buyer (settlement proof, no real money)
└── circle-kit/          ← Circle Agent Stack starter kits (buyer = claude-agent-sdk)
```

## Status

- Seller: working end-to-end — valid x402 v2 challenge, Circle Gateway
  settlement, egress forwarding, receipts, live dashboard. Verified locally.
- Buyer: the Circle Claude kit drives the workflow; mainnet run needs the
  operator's Circle login + ~$1 USDC.
