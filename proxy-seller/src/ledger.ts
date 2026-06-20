import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_FILE = join(__dirname, '..', 'ledger.jsonl');

/**
 * One paid proxy call. This IS the receipt the agent (and the judges) get back:
 * who paid, how much, the on-chain settlement tx, what egress the bytes left
 * through, and what target was fetched.
 */
export interface Receipt {
  ts: string;
  /** Buyer agent wallet that paid. */
  payer: string;
  /** USDC paid, atomic units (6 decimals) as the facilitator reports it. */
  amountAtomic: string;
  /** Human USDC, e.g. "0.001". */
  amountUsdc: string;
  /** Chain the payment settled on (CAIP-2). */
  network: string;
  /** On-chain settlement tx hash, when the facilitator returned one. */
  tx?: string;
  /** The URL the agent paid to fetch through the proxy. */
  target: string;
  /** Public IP the proxied request egressed from (the "VPN exit"). */
  egressIp: string;
  /** Upstream HTTP status the proxy got back from the target. */
  status: number;
  /** Bytes returned to the agent. */
  bytes: number;
}

const memory: Receipt[] = [];

/** Load any receipts already on disk so a restart keeps the running ledger. */
function hydrate(): void {
  if (!existsSync(LEDGER_FILE)) return;
  for (const line of readFileSync(LEDGER_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      memory.push(JSON.parse(trimmed) as Receipt);
    } catch {
      // Skip a corrupt line rather than dropping the whole ledger.
    }
  }
}
hydrate();

/** Append a receipt to disk (JSONL) and the in-memory list. */
export function record(receipt: Receipt): void {
  memory.push(receipt);
  appendFileSync(LEDGER_FILE, JSON.stringify(receipt) + '\n');
}

/** All receipts, newest first. */
export function all(): Receipt[] {
  return [...memory].reverse();
}

/** Per-payer spend totals, for the dashboard's "who spent what". */
export function totals(): Array<{ payer: string; calls: number; usdc: number }> {
  const byPayer = new Map<string, { calls: number; usdc: number }>();
  for (const r of memory) {
    const cur = byPayer.get(r.payer) ?? { calls: 0, usdc: 0 };
    cur.calls += 1;
    cur.usdc += Number(r.amountUsdc) || 0;
    byPayer.set(r.payer, cur);
  }
  return [...byPayer.entries()]
    .map(([payer, v]) => ({ payer, ...v }))
    .sort((a, b) => b.usdc - a.usdc);
}

/** Grand total USDC earned, for the dashboard header. */
export function grandTotalUsdc(): number {
  return memory.reduce((sum, r) => sum + (Number(r.amountUsdc) || 0), 0);
}
