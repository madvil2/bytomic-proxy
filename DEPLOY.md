# Deploy — testnet, public, live

Goal: `proxy-seller` running on a public HTTPS URL, on **Base Sepolia** testnet,
with the live dashboard reachable for the demo.

## 1. Seller env (Base Sepolia testnet)

In `proxy-seller/.env`:

```
SELLER_WALLET_ADDRESS=0x...        # any EVM address you control (receives USDC)
FACILITATOR_URL=https://gateway-api-testnet.circle.com
NETWORKS=eip155:84532              # Base Sepolia
PRICE=$0.001
PORT=3402
PUBLIC_URL=https://<your-public-url>
# Optional, for a money-free live proxy demo:
DEV_BYPASS_KEY=<random-secret>
```

## 2. Run it on your server (keep it alive)

```bash
cd proxy-seller && npm install
npm i -g pm2
pm2 start "npm start" --name relay402 && pm2 save
pm2 logs relay402        # watch paid calls land
```

## 3. Make it public HTTPS (pick one)

**Fastest — Cloudflare Tunnel (no DNS, instant https):**
```bash
brew install cloudflared    # or your OS pkg
cloudflared tunnel --url http://localhost:3402
# prints https://<random>.trycloudflare.com  → put it in PUBLIC_URL, restart pm2
```

**Or Caddy (own domain, auto-TLS):**
```
relay402.example.com {
  reverse_proxy localhost:3402
}
```

## 4. Smoke test (public)

```bash
curl -s https://<url>/catalog | grep egressIp
# real x402 rail armed (no bypass): expect a 402 + payment-required header
curl -s -D - -o /dev/null 'https://<url>/proxy?url=https://example.com' | grep -i payment-required
# money-free live proxy proof: returns the SERVER egress IP, logs a receipt
curl -s -H 'x-dev-bypass: <DEV_BYPASS_KEY>' 'https://<url>/proxy?url=https://httpbin.org/ip'
open https://<url>/        # dashboard
```

## 5. Get a REAL on-chain paid call (two routes)

The seller is proven; a real settled tx needs a funded buyer.

**Route A — testnet, free, recommended for "works on testnet":** buyer wallet on
Base Sepolia, funded by the CLI faucet drip + Gateway deposit, paid with the
proven Circle CLI / `npm run buyer`. Cost: $0. Clickable Base Sepolia tx hashes on
the dashboard. **Full step-by-step in [TESTNET.md](TESTNET.md)** — no extra code
needed.

**Route B — mainnet, ~$1, zero new code:** run the Circle Claude kit
(`circle-kit/kits/claude-agent-sdk`) per `BUYER.md`, switch seller to
`FACILITATOR_URL=https://gateway-api.circle.com` + `NETWORKS=eip155:8453`, fund
~$1 USDC, do one $0.001 paid fetch on camera. Real Base mainnet tx.

For the video: dashboard + dev-bypass proves the proxy live; Route A (testnet) or
B (mainnet) provides the on-chain receipt. Do both — bypass for the smooth live
loop, one real tx for the proof.
