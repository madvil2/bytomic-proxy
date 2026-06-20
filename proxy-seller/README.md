# proxy-seller — pay-per-request proxy egress for AI agents (x402)

An HTTP proxy that charges **USDC per request** over the **x402** protocol,
settled through **Circle Gateway**. An agent pays a nanopayment, the request is
forwarded through this host's network (the egress / "VPN exit"), and the agent
gets the response plus a receipt. Every paid call is written to a spend ledger
with the on-chain settlement tx.

This is the **seller** half of the project. The buyer is an autonomous Claude
agent using a Circle Agent Wallet — see [`../BUYER.md`](../BUYER.md).

## Endpoints

| Method | Path | Pay? | Purpose |
| --- | --- | --- | --- |
| GET | `/catalog` | free | Service discovery: price, egress IP, input schema. |
| GET | `/proxy?url=<target>` | **$0.001** | Fetch `<target>` through this host. Omit `url` to get just your egress IP. |
| GET | `/ledger` | free | JSON spend ledger: receipts + per-agent totals. |
| GET | `/` | free | Live dashboard. |

A paid call returns headers `x-proxy-egress-ip` and `x-payment-tx`.

## How payment works

`GET /proxy` is wrapped by `createGatewayMiddleware(...).require("$0.001")` from
[`@circle-fin/x402-batching`](https://www.npmjs.com/package/@circle-fin/x402-batching):

1. An unpaid GET gets `HTTP 402` with an x402 challenge (`accepts[]`: scheme
   `exact`, USDC asset, our `payTo`, the GatewayWalletBatched scheme).
2. The agent signs a USDC payment and retries.
3. Circle Gateway (the facilitator) **verifies + settles** on-chain.
4. Only then does our handler run: it forwards the target and writes the receipt
   from `req.payment` (`payer`, `amount`, `network`, `transaction`).

We never touch a private key or RPC — Circle Gateway runs the payment rail.

## Run

```bash
cp .env.example .env     # set SELLER_WALLET_ADDRESS, network, facilitator
npm install
npm start
```

Key env (`.env.example` has the full list):

- `SELLER_WALLET_ADDRESS` — EVM address that receives USDC.
- `FACILITATOR_URL` — `https://gateway-api.circle.com` (mainnet) or
  `…-testnet.circle.com` (testnet, default in the example).
- `NETWORKS` — CAIP-2 list. Base mainnet `eip155:8453`, Base Sepolia
  `eip155:84532`, Arc testnet `eip155:5042002`. Empty = all supported.
- `PRICE` — per request, e.g. `$0.001`.
- `DEV_BYPASS_KEY` — optional; a request with header `x-dev-bypass: <key>` skips
  payment so you can exercise the proxy + ledger without a funded wallet.

## Quick local check (no money, via dev-bypass)

```bash
echo 'DEV_BYPASS_KEY=letmein' >> .env && npm start
# forward a real fetch through the egress and log a receipt:
curl -s -H 'x-dev-bypass: letmein' 'http://localhost:3402/proxy?url=https://api.github.com/zen'
# see it on the ledger + dashboard:
curl -s localhost:3402/ledger ; open http://localhost:3402/
```

Verify the real payment path is armed (no bypass header → 402 challenge):

```bash
curl -s -D - -o /dev/null 'http://localhost:3402/proxy?url=https://example.com' | grep -i payment-required
```
