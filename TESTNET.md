# Testnet end-to-end — real on-chain settlement, $0

Full pay → settle → forward → receipt loop on **Base Sepolia** with **real tx
hashes**, no real money. Everything uses the proven **Circle CLI** + our
`scripts/buyer.ts`. Verified the CLI supports it: `circle gateway deposit
--chain BASE-SEPOLIA`, `circle wallet fund` (testnet faucet drip), `circle
services pay --chain BASE-SEPOLIA`.

## 0. Install Circle CLI

```bash
npm i -g @circle-fin/cli          # circle 0.0.5+
circle wallet login               # email + OTP (free Circle account)
```

## 1. Seller on Base Sepolia (public URL)

`proxy-seller/.env`:
```
SELLER_WALLET_ADDRESS=0xYOUR_SELLER          # receives USDC (any wallet you own)
FACILITATOR_URL=https://gateway-api-testnet.circle.com
NETWORKS=eip155:84532                          # Base Sepolia
PRICE=$0.001
PUBLIC_URL=https://<your-public-url>
```
Run it + expose (see DEPLOY.md — Cloudflare tunnel is fastest):
```bash
cd proxy-seller && npm install && npm start
cloudflared tunnel --url http://localhost:3402   # → put the https URL in PUBLIC_URL, restart
```

## 2. Buyer wallet — create, fund (faucet), deposit to Gateway

```bash
# create an agent (smart-contract) wallet on Base Sepolia
circle wallet create --type agent --chain BASE-SEPOLIA
# note the 0x address it prints → export BUYER=0x...
export BUYER=0xYOUR_AGENT_WALLET

# free testnet USDC via the CLI faucet drip
circle wallet fund --address $BUYER --chain BASE-SEPOLIA

# the proxy uses Circle's batched (Gateway) scheme → move USDC into Gateway
circle gateway deposit --amount 0.5 --address $BUYER --chain BASE-SEPOLIA
circle gateway balance --address $BUYER --chain BASE-SEPOLIA --all   # confirm
```

## 3. One real paid fetch (sanity)

```bash
circle services pay "https://<your-public-url>/proxy?url=https://httpbin.org/ip" \
  --address $BUYER --chain BASE-SEPOLIA --method GET --max-amount 0.001 --output json
```
Expect: JSON `response` = `{"origin":"<seller egress IP>"}` and a `payment.receipt`
carrying the on-chain tx. The seller dashboard (`/`) shows the row + Base Sepolia
tx link instantly.

## 4. The budget-capped workflow (the demo)

```bash
cd proxy-seller
WALLET_ADDRESS=$BUYER \
PROXY_URL=https://<your-public-url> \
CHAIN=BASE-SEPOLIA \
BUDGET_USDC=0.05 PRICE_USDC=0.001 \
npm run buyer
```
Loops the target list, pays per fetch, **stops at the $0.05 cap and says which
call it skipped**, prints a spend ledger with tx hashes. `--max-amount` also makes
the CLI refuse any overpay on-chain.

## 5. AI buyer (optional, same testnet)

The Claude kit is wired to Base mainnet by default, but the underlying tools are
the same CLI. For the headline "autonomous agent" story you can either run the
kit on mainnet (BUYER.md, ~$1) or narrate `npm run buyer` as the deterministic
agent loop. Both hit the identical seller + dashboard.

## What this proves to judges

- Real x402 settlement through **Circle Gateway** on a public testnet — clickable
  on-chain tx per call.
- The agent **discovers, pays per request, forwards through the proxy egress, and
  returns a receipted, budget-capped spend ledger** — the exact Circle brief.
- Both sides live: buyer ledger in the terminal, seller ledger on the dashboard.
