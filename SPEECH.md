# Bytomic Proxy — speech to read aloud (~2 min)

Plain spoken script. No stage directions — just read it. Pause at the line breaks.
**[S#]** marks which deck slide to be on while you read that part.

---

**[S0 · Title]**
Hi — we're team Bytomic, and we built **Bytomic Proxy**.

**[S1 · Problem]**
Here's the problem. AI agents can't browse at scale. The moment an agent scrapes from its own datacenter IP, it hits rate limits, geo-blocks, bans. The normal fix is a proxy — but every proxy wants an account, KYC, a monthly contract. A bot can't sign up for that.

**[S2 · Solution]**
So we built web egress an agent just **pays for** — per request, in USDC. No account. No API key. The wallet *is* the access.

**[S3 · How it works]**
It runs on **x402** — the HTTP "402 Payment Required" protocol. The agent reads our price on a free catalog endpoint, calls the proxy, gets a 402, signs a tenth-of-a-cent USDC payment from its Circle Agent Wallet, and retries. Circle Gateway settles it — gaslessly, we never hold a key — and we fetch the target through our IP and hand back the data with a receipt.

**[S4 · Demo]**
Let me show you one real paid call.

This is the unpaid request — the server answers 402, with the price, the asset, our wallet, on Base and Polygon.

Now the agent pays. A Circle agent wallet, a tenth of a cent, budget-capped. Circle Gateway settles it…

…and look at the response. The IP is our server's IP — not the agent's. The request actually relayed through our proxy. One paid call, the whole product proven.

**[S5 · Ledger]**
And every paid call lands in a live ledger — payer, amount, network, the target it fetched, the egress it left through, and the Circle settlement receipt. The agent gets its data, the operator gets paid, and it's all auditable — under a hard budget cap.

**[S6 · Stack]**
We didn't reinvent payments. Circle Agent Wallet is the agent's identity and budget. x402 is the per-call payment. Circle Gateway settles it. Base carries it. **Bytomic Proxy is the new piece** — metered egress as a primitive every agent needs.

**[S7 · Use cases]**
Research agents, market scrapers, QA agents geo-testing from another region — any autonomous agent that needs an IP that isn't its own. Cents per call, no plan, no key.

**[S8 · Close]**
Bytomic Proxy. Give your agent an exit. Live right now at proxy.bytomic.tech.

Thanks.
