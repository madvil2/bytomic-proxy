# Buyer agent — Research-with-a-budget over the paid proxy

The buyer is the **Circle Claude Agent SDK kit** (`circle-kit/kits/claude-agent-sdk`),
an autonomous Claude agent whose only tools are the Circle Agent Wallet stack
(create wallet, check balance, discover services, inspect, **pay x402**). We do
not modify it — we give it a job that makes the wallet part of the work:

> An agent that fetches rate-limited / geo-blocked sources through a
> **pay-per-request proxy**, paying USDC per fetch from its Circle wallet,
> under a hard budget, and returns a spend ledger with on-chain tx hashes.

## One-time setup (operator does this)

1. Start the seller (see `proxy-seller/README.md`) on a public URL, e.g.
   `https://proxy.example.com`. For the Circle kit buyer it must run on
   **Base mainnet**: in `proxy-seller/.env` set
   `FACILITATOR_URL=https://gateway-api.circle.com` and
   `NETWORKS=eip155:8453`.
2. In `circle-kit/kits/claude-agent-sdk/.env` set `ANTHROPIC_API_KEY`.
3. From `circle-kit/`: `bun install` then
   `bun run --cwd kits/claude-agent-sdk demo`.
4. The kit walks you through Circle login (email + OTP), wallet creation, and
   funding (~$1 USDC via the Transak on-ramp is plenty — calls cost $0.001).
   A Gateway deposit is needed because the proxy uses the batched scheme; the
   agent's `circle_gateway_deposit` tool handles it on request.

## The task prompt (paste as the first "You:" turn after wallet setup)

```
You are a research agent with a STRICT budget of $0.05 USDC. Your wallet is the
Circle agent wallet you just set up. You buy web fetches from a pay-per-request
proxy service so you can reach rate-limited and geo-blocked sources.

The proxy:
- Discovery (free):   GET https://proxy.example.com/catalog
- Paid fetch:         GET https://proxy.example.com/proxy   (input: url=<target>)
  Pay it with circle_pay_service using method GET and data {"url":"<target>"}.

Do this:
1. fetch_service the /catalog URL to learn the price and confirm the egress IP.
2. For each target below, pay the proxy to fetch it, ONE at a time:
   - https://api.github.com/zen
   - https://httpbin.org/ip
   - https://api.coindesk.com/v1/bpi/currentprice.json
3. Before every paid call, add its price to your running total. If the next call
   would push total spend over $0.05, STOP and explain which call you skipped and
   why — do not pay it.
4. After each paid call, note the tx hash from the result.
5. End with a spend ledger: a table of target | price | tx hash, plus total spent
   and budget remaining.

Treat each paid fetch as justified only if it returns useful data; if a fetch
fails after payment, do NOT re-pay the same URL (x402 charges before the
response).
```

## What the judges see

- The agent **discovers** the service, **inspects** pricing, **pays per call**
  from its Circle wallet, and **returns a receipted ledger** — the exact loop
  the Circle bounty asks for ("buying data ... return a receipt or spend ledger").
- The **budget cap** is visible policy: the agent refuses the call that would
  breach $0.05 and says why.
- The seller's live dashboard (`/`) shows the same payments arriving in real
  time, per-agent spend, and clickable on-chain tx links — both sides of the
  trade.

## Faster dev loop (no real money): testnet buyer

`proxy-seller/scripts/buyer.ts` is a non-AI buyer that drives the same x402
settlement on **Base Sepolia** with a funded test wallet, so you can prove the
pay→settle→forward→receipt loop end-to-end without spending real USDC. See its
header for the env it needs (`PRIVATE_KEY`, testnet USDC, Gateway deposit).
