/**
 * Deterministic test buyer — proves the full pay → settle → forward → receipt
 * loop against the proxy seller, with a hard budget cap, using the SAME rail the
 * Claude agent uses: the Circle CLI's `circle services pay`. No LLM here; this is
 * the mechanical proof that the seller settles and forwards. The headline AI
 * buyer is the Circle Claude kit driven by BUYER.md.
 *
 * Prerequisites (operator):
 *   - Circle CLI installed + logged in:  bun add -g @circle-fin/cli  &&  circle login
 *   - An agent wallet with USDC (and, for the batched scheme, a Gateway deposit).
 *     Testnet keeps it free: fund a Base Sepolia wallet from a faucet.
 *   - The proxy-seller running and reachable at PROXY_URL.
 *
 * Env:
 *   WALLET_ADDRESS   paying Circle agent wallet (0x...)         [required]
 *   PROXY_URL        seller base URL, e.g. http://localhost:3402 [required]
 *   CHAIN            BASE | POLYGON (Circle CLI chain name)      [default BASE]
 *   BUDGET_USDC      hard spend cap                              [default 0.05]
 *   PRICE_USDC       price per call (from /catalog)              [default 0.001]
 *
 * Targets: pass as CLI args, or the default list is used.
 *   tsx scripts/buyer.ts https://api.github.com/zen https://httpbin.org/ip
 */
import { execFileSync } from 'node:child_process';

const WALLET = req('WALLET_ADDRESS');
const PROXY_URL = req('PROXY_URL').replace(/\/$/, '');
const CHAIN = process.env.CHAIN || 'BASE';
const BUDGET = Number(process.env.BUDGET_USDC || '0.05');
const PRICE = Number(process.env.PRICE_USDC || '0.001');

const TARGETS =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['https://api.github.com/zen', 'https://httpbin.org/ip', 'https://api.coindesk.com/v1/bpi/currentprice.json'];

function req(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing env ${name}.`);
    process.exit(1);
  }
  return v;
}

const TX_RE = /0x[a-fA-F0-9]{64}/;

interface Row {
  target: string;
  price: number;
  tx: string;
  status: 'paid' | 'skipped' | 'error';
  note?: string;
}

/** Pay the proxy to fetch one target via the Circle CLI; return tx + body. */
function payFetch(target: string): { tx: string; body: string } {
  const url = `${PROXY_URL}/proxy?url=${encodeURIComponent(target)}`;
  // Mirror the Claude kit's pay invocation: GET, JSON output, generous timeout.
  const out = execFileSync(
    'circle',
    ['services', 'pay', url, '--address', WALLET, '--chain', CHAIN, '--method', 'GET', '--timeout', '60', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let body = out.trim();
  let receipt = out;
  try {
    const env = JSON.parse(out) as { response?: unknown; payment?: { receipt?: string } };
    if (env.response !== undefined) body = typeof env.response === 'string' ? env.response : JSON.stringify(env.response);
    if (env.payment?.receipt) receipt = env.payment.receipt;
  } catch {
    // Non-JSON stdout: keep raw.
  }
  let tx = receipt.match(TX_RE)?.[0] ?? '';
  if (!tx) {
    try {
      tx = Buffer.from(receipt, 'base64').toString('utf8').match(TX_RE)?.[0] ?? '';
    } catch {
      /* no tx parsed; not fatal */
    }
  }
  return { tx, body };
}

async function main(): Promise<void> {
  console.log(`buyer: wallet=${WALLET} chain=${CHAIN} budget=$${BUDGET} price=$${PRICE}`);
  console.log(`proxy: ${PROXY_URL}\n`);

  const rows: Row[] = [];
  let spent = 0;

  for (const target of TARGETS) {
    // Budget policy: refuse the call that would breach the cap, and say why.
    if (spent + PRICE > BUDGET + 1e-9) {
      console.log(`SKIP  ${target}  (would exceed $${BUDGET} cap; spent $${spent.toFixed(3)})`);
      rows.push({ target, price: 0, tx: '', status: 'skipped', note: 'over budget' });
      continue;
    }
    try {
      console.log(`PAY   ${target} ...`);
      const { tx, body } = payFetch(target);
      spent += PRICE;
      const preview = body.replace(/\s+/g, ' ').slice(0, 60);
      console.log(`  ✓ $${PRICE}  tx=${tx || 'n/a'}  ${preview}`);
      rows.push({ target, price: PRICE, tx, status: 'paid' });
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0];
      console.log(`  ✗ ${msg}`);
      rows.push({ target, price: 0, tx: '', status: 'error', note: msg });
    }
  }

  console.log('\n— spend ledger —');
  for (const r of rows) {
    console.log(`${r.status.padEnd(7)} $${r.price.toFixed(3)}  ${r.tx || '—'}  ${r.target}`);
  }
  console.log(`\ntotal spent  $${spent.toFixed(3)} / $${BUDGET} budget   (${rows.filter((r) => r.status === 'paid').length} paid, ${rows.filter((r) => r.status === 'skipped').length} skipped)`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
