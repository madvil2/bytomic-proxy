/**
 * Self-contained live dashboard, served at `/`. It polls `/ledger` and renders
 * the running spend: grand total earned, per-agent spend, and a receipt feed
 * with clickable on-chain tx links. No build step, no framework.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Agent Proxy — spend ledger</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0b0f14; color: #d7e0ea;
    font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  header { padding: 20px 24px; border-bottom: 1px solid #1c2530; }
  h1 { margin: 0; font-size: 16px; letter-spacing: .04em; color: #6ee7b7; }
  .sub { color: #6b7888; font-size: 12px; margin-top: 4px; }
  .stats { display: flex; flex-wrap: wrap; gap: 16px; padding: 18px 24px; }
  .card { background: #111823; border: 1px solid #1c2530; border-radius: 10px; padding: 14px 18px; min-width: 150px; }
  .card .k { color: #6b7888; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .card .v { font-size: 22px; color: #e8eef5; margin-top: 4px; }
  .card .v.green { color: #6ee7b7; }
  section { padding: 0 24px 28px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #6b7888; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #161e29; font-size: 12px; white-space: nowrap; }
  th { color: #6b7888; font-weight: 500; }
  td.target { white-space: normal; word-break: break-all; max-width: 360px; color: #cdd9e6; }
  .mono { color: #8aa0b6; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px; }
  .ok { background: #0f2a1e; color: #6ee7b7; }
  .bad { background: #2a1414; color: #f87171; }
  .empty { color: #6b7888; padding: 24px 10px; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #6ee7b7; margin-right: 6px; animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
</style>
</head>
<body>
<header>
  <h1>AGENT PROXY · x402 spend ledger</h1>
  <div class="sub"><span class="dot"></span>live · pay-per-request egress for AI agents · egress IP <span id="egress" class="mono">—</span></div>
</header>
<div class="stats">
  <div class="card"><div class="k">Earned</div><div class="v green" id="earned">$0.00</div></div>
  <div class="card"><div class="k">Paid calls</div><div class="v" id="calls">0</div></div>
  <div class="card"><div class="k">Paying agents</div><div class="v" id="agents">0</div></div>
</div>
<section>
  <h2>By agent</h2>
  <table id="totals"><thead><tr><th>Agent wallet</th><th>Calls</th><th>Spent</th></tr></thead><tbody></tbody></table>
  <h2>Receipts</h2>
  <table id="receipts">
    <thead><tr><th>Time</th><th>Payer</th><th>USDC</th><th>Target</th><th>Status</th><th>Tx</th></tr></thead>
    <tbody></tbody>
  </table>
  <div class="empty" id="empty">No paid calls yet. Point an agent at <span class="mono">/proxy?url=…</span></div>
</section>
<script>
  // Escape every interpolated value: the target URL is agent-controlled, so
  // unescaped innerHTML would be a stored-XSS hole on the operator's dashboard.
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = (s) => (s && s.length > 14 ? s.slice(0, 8) + '…' + s.slice(-4) : s || '—');
  // Base mainnet explorer; harmless for testnet rows (link just won't resolve).
  // Only render a link for a real 0x hash so nothing arbitrary lands in href.
  const txLink = (tx, net) => {
    if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return tx ? esc(short(tx)) : '—';
    const base = (net || '').includes('84532') ? 'https://sepolia.basescan.org/tx/'
      : 'https://basescan.org/tx/';
    return '<a href="' + base + tx + '" target="_blank" rel="noreferrer">' + short(tx) + '</a>';
  };
  async function tick() {
    let d;
    try { d = await (await fetch('/ledger')).json(); } catch { return; }
    document.getElementById('egress').textContent = d.egressIp || '—';
    document.getElementById('earned').textContent = '$' + (d.grandTotalUsdc || 0).toFixed(4);
    document.getElementById('calls').textContent = d.receipts.length;
    document.getElementById('agents').textContent = d.totals.length;
    document.getElementById('empty').style.display = d.receipts.length ? 'none' : 'block';

    document.querySelector('#totals tbody').innerHTML = d.totals.map((t) =>
      '<tr><td class="mono">' + esc(short(t.payer)) + '</td><td>' + esc(t.calls) +
      '</td><td>$' + (Number(t.usdc) || 0).toFixed(4) + '</td></tr>').join('');

    document.querySelector('#receipts tbody').innerHTML = d.receipts.map((r) => {
      const ok = r.status >= 200 && r.status < 400;
      return '<tr>' +
        '<td class="mono">' + esc(new Date(r.ts).toLocaleTimeString()) + '</td>' +
        '<td class="mono">' + esc(short(r.payer)) + '</td>' +
        '<td>' + esc(r.amountUsdc) + '</td>' +
        '<td class="target">' + esc(r.target) + '</td>' +
        '<td><span class="pill ' + (ok ? 'ok' : 'bad') + '">' + esc(r.status) + '</span></td>' +
        '<td>' + txLink(r.tx, r.network) + '</td>' +
      '</tr>';
    }).join('');
  }
  tick();
  setInterval(tick, 2000);
</script>
</body>
</html>`;
