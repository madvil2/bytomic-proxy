import 'dotenv/config';
import express from 'express';
import { formatUnits } from 'viem';
import { createGatewayMiddleware, type PaymentRequest } from '@circle-fin/x402-batching/server';

import { record, all, totals, grandTotalUsdc, type Receipt } from './ledger.ts';
import { DASHBOARD_HTML } from './dashboard.ts';

const SELLER = required('SELLER_WALLET_ADDRESS');
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://gateway-api.circle.com';
const NETWORKS = (process.env.NETWORKS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);
const PRICE = process.env.PRICE || '$0.001';
const PORT = Number(process.env.PORT || 3402);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

/**
 * The proxy's public egress IP: the address any request it forwards appears to
 * come from. This is the whole point of a proxy/VPN, so we resolve it once at
 * boot and surface it on every receipt and on the dashboard as proof the bytes
 * really left through this host, not the agent's own network.
 */
let EGRESS_IP = 'unknown';
async function resolveEgressIp(): Promise<void> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const body = (await res.json()) as { ip?: string };
    if (body.ip) EGRESS_IP = body.ip;
  } catch {
    // Non-fatal: the proxy still works, we just can't show the exit IP.
  }
}

const app = express();

const gateway = createGatewayMiddleware({
  sellerAddress: SELLER,
  facilitatorUrl: FACILITATOR_URL,
  ...(NETWORKS.length ? { networks: NETWORKS } : {}),
  description: 'Pay-per-request proxy egress for AI agents',
});

/**
 * Optional dev/test bypass. When DEV_BYPASS_KEY is set, a request carrying a
 * matching `x-dev-bypass` header skips payment so the proxy + ledger path can be
 * exercised locally without a funded Gateway balance. Real x402 payments still
 * work unchanged; this only adds a second, explicitly-keyed door. Receipts from
 * a bypassed call are tagged payer="dev-bypass" with no tx, so they are never
 * mistaken for a settled on-chain payment.
 */
const DEV_BYPASS_KEY = process.env.DEV_BYPASS_KEY?.trim();
if (DEV_BYPASS_KEY) {
  gateway.onProtectedRequest(async (ctx) => {
    if (ctx.getHeader('x-dev-bypass') === DEV_BYPASS_KEY) return { grantAccess: true };
  });
  console.warn('DEV_BYPASS_KEY is set: requests with a matching x-dev-bypass header skip payment.');
}

/**
 * Free discovery endpoint. An agent GETs this first (no payment), reads what the
 * service does and what it costs, then knows to pay /proxy. Mirrors how the
 * Circle marketplace / fetch_service free-tier probe works.
 */
app.get('/catalog', (_req, res) => {
  res.json({
    name: 'Agent Proxy — pay-per-request egress',
    description:
      'Fetch any URL through this host\'s network. Each call is paid in USDC over x402. ' +
      'Returns the upstream response plus the egress IP the request left through.',
    price: PRICE,
    paidEndpoint: `${PUBLIC_URL}/proxy`,
    method: 'GET',
    input: {
      url: 'Target URL to fetch through the proxy. Omit to just learn your egress IP.',
    },
    egressIp: EGRESS_IP,
    network: NETWORKS.length ? NETWORKS : 'all Gateway-supported',
    settlement: 'Circle Gateway (x402 batched USDC)',
  });
});

/**
 * The paid resource. `gateway.require(PRICE)` runs first: an unpaid GET gets an
 * HTTP 402 challenge, a paid GET settles the USDC and only then reaches this
 * handler with `req.payment` populated. We forward the target through this
 * host's network (the egress), write the receipt, and return the bytes.
 */
app.get('/proxy', gateway.require(PRICE), async (req, res) => {
  const payment = (req as unknown as PaymentRequest).payment;
  const target = typeof req.query.url === 'string' ? req.query.url : '';

  let status = 200;
  let body: string;
  let contentType = 'application/json';

  if (!target) {
    // No target: act as an "what's my IP" probe so the agent still gets value
    // for its payment (a legitimate proxy feature) instead of an error.
    body = JSON.stringify({ egressIp: EGRESS_IP, note: 'No url given; this is your proxy exit IP.' });
  } else {
    try {
      const upstream = await fetch(target, {
        method: 'GET',
        headers: { 'user-agent': 'agent-proxy/0.1 (+x402)' },
        signal: AbortSignal.timeout(20_000),
      });
      status = upstream.status;
      contentType = upstream.headers.get('content-type') || 'text/plain';
      body = await upstream.text();
    } catch (e) {
      status = 502;
      body = JSON.stringify({ error: `Proxy could not reach target: ${(e as Error).message}` });
      contentType = 'application/json';
    }
  }

  // Build + persist the receipt. Payment is guaranteed present here (the
  // middleware would have 402'd otherwise), but stay defensive on the fields.
  const bypassed = !payment && !!DEV_BYPASS_KEY && req.get('x-dev-bypass') === DEV_BYPASS_KEY;
  const amountAtomic = payment?.amount ?? '0';
  const receipt: Receipt = {
    ts: new Date().toISOString(),
    payer: payment?.payer ?? (bypassed ? 'dev-bypass' : 'unknown'),
    amountAtomic,
    amountUsdc: safeFormatUsdc(amountAtomic),
    network: payment?.network ?? 'unknown',
    tx: payment?.transaction,
    target: target || '(egress-ip probe)',
    egressIp: EGRESS_IP,
    status,
    bytes: Buffer.byteLength(body),
  };
  record(receipt);
  console.log(
    `[paid] ${receipt.amountUsdc} USDC from ${receipt.payer} → ${receipt.target} ` +
      `(${status}, ${receipt.bytes}b) tx=${receipt.tx ?? 'n/a'}`,
  );

  res
    .status(status)
    .set('content-type', contentType)
    .set('x-proxy-egress-ip', EGRESS_IP)
    .set('x-payment-tx', receipt.tx ?? '')
    .send(body);
});

/** Machine-readable spend ledger: every receipt, newest first. */
app.get('/ledger', (_req, res) => {
  res.json({ egressIp: EGRESS_IP, grandTotalUsdc: grandTotalUsdc(), totals: totals(), receipts: all() });
});

/** Live human dashboard. */
app.get('/', (_req, res) => {
  res.set('content-type', 'text/html').send(DASHBOARD_HTML);
});

function safeFormatUsdc(atomic: string): string {
  try {
    return formatUnits(BigInt(atomic), 6);
  } catch {
    return '0';
  }
}

await resolveEgressIp();
app.listen(PORT, () => {
  console.log(`\n  Agent Proxy (x402 seller) listening on ${PUBLIC_URL}`);
  console.log(`  egress IP        ${EGRESS_IP}`);
  console.log(`  price/request    ${PRICE}`);
  console.log(`  seller wallet    ${SELLER}`);
  console.log(`  facilitator      ${FACILITATOR_URL}`);
  console.log(`  networks         ${NETWORKS.length ? NETWORKS.join(', ') : 'all Gateway-supported'}`);
  console.log(`\n  discovery   GET ${PUBLIC_URL}/catalog   (free)`);
  console.log(`  paid proxy  GET ${PUBLIC_URL}/proxy?url=<target>   (${PRICE})`);
  console.log(`  dashboard       ${PUBLIC_URL}/\n`);
});
