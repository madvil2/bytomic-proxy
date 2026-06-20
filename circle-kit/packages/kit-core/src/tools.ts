import {
  getServiceAccepts,
  preferredChain,
  sellerRequiresGateway,
  isWalletDeployed,
  chainLabel,
  type Chain,
  type GatewayDepositMethod,
} from '@agent-stack-ecosystem-kits/circle-tools';

import { SETUP_SKILL_URL, SUB_SKILLS, SUB_SKILL_NAMES } from './skill';
import { bold, colorizeJson, green, red, yellow } from './theme';

/**
 * The two tools that move USDC. Each kit gates these behind human approval
 * (inline `approveSpend`, or its framework's external hook), and every other
 * tool runs without a pause. Kept here so the name list is single-sourced.
 */
export const SPEND_TOOL_NAMES = ['circle_pay_service', 'circle_gateway_deposit'] as const;

/** The chains the kits can pay on, in preference order. */
export const CHAINS = ['BASE', 'POLYGON'] as const;

/**
 * Brief's AGENT BOOTSTRAP PROMPT, verbatim. setup.md drives the first turn:
 * the agent fetches it and follows the returned instructions.
 */
export const BOOTSTRAP_PROMPT =
  `Run curl -sL ${SETUP_SKILL_URL}, ` +
  'and use the returned setup instructions to set up my agent wallet.';

/** Bullet list of the sub-skills and their URLs, for the fetch_sub_skill description. */
export const subSkillCatalog = SUB_SKILL_NAMES.map((n) => `- ${n} → ${SUB_SKILLS[n]}`).join('\n');

/** Collapse a value to one line and cap its length, for compact log lines. */
export function preview(value: string, max = 120): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/**
 * The model-facing tool descriptions, single-sourced so a wording change lands
 * in every kit at once. `circle_pay_service` is a function because two kits
 * expose the payload as a JSON string (`dataJson`) and the rest as an object
 * (`data`); the only difference is which word the description uses.
 */
export const TOOL_DESCRIPTIONS = {
  fetch_setup_skill: `Fetch the Circle Agent setup skill from ${SETUP_SKILL_URL}. Equivalent to "curl -sL ${SETUP_SKILL_URL}". Returns the raw markdown setup instructions to follow.`,

  fetch_sub_skill: `Fetch a Circle Agent sub-skill markdown by name. Call this when setup.md (or a tool error) references one of these sub-skills:\n${subSkillCatalog}`,

  circle_list_wallets: 'List existing Circle agent wallets on Base. Returns an array of { address }.',

  circle_create_wallet: 'Create a new Circle agent wallet on Base. Returns { address }.',

  circle_get_balance:
    'Check USDC and token balances for a wallet address. Defaults to Base; pass chain "POLYGON" to read the Polygon balance.',

  circle_deploy_wallet:
    `Deploy an agent wallet's Smart Contract Account on-chain via a one-time, ` +
    'zero-value self-transfer. A freshly created wallet is counterfactual: it can receive ' +
    'USDC but cannot sign x402 payments until deployed. Deployment is per-chain, so deploy on ' +
    'the chain the payment will settle on (defaults to Base; pass chain "POLYGON" for a ' +
    'Polygon-only service). Idempotent and gas-abstracted (spends nothing), and safe to call ' +
    'on an already-deployed wallet, where it sends no transaction. Call this before ' +
    'circle_pay_service for any wallet that has never sent a transaction on that chain.',

  circle_fund_fiat:
    'Fund a wallet with a fiat (card / bank) purchase via the Transak on-ramp. ' +
    'Returns a Transak `url` to give the user as a link to open: they complete the ' +
    'purchase there and the tokens deposit to the wallet on the chosen chain (defaults ' +
    'to Base). This tool only generates the URL and moves no USDC itself, so it needs ' +
    'no approval; the user pays inside the on-ramp. Use this when the user wants to buy ' +
    'USDC with money they do not yet hold in crypto. After the user reports the purchase ' +
    'complete, confirm with circle_get_balance. Mainnet only.',

  circle_search_services:
    'Discover x402-compatible services on the Circle Agent Marketplace matching a keyword.',

  circle_inspect_service:
    'Inspect an x402 service. Returns pricing, input schema, HTTP method, and health. Always ' +
    'call this before circle_pay_service so both the payload matches the schema and the ' +
    "`method` is passed through (a GET service's input goes in the query string, not a body).",

  fetch_service:
    'GET a service endpoint with no payment: the free-tier path. Try this FIRST ' +
    'for any endpoint a user names. A free endpoint (e.g. a catalog or index) ' +
    'returns its data directly with HTTP 200; use that body as the answer. If the ' +
    'result has paymentRequired=true (HTTP 402), the endpoint is paid: call ' +
    'circle_inspect_service then circle_pay_service instead. Free endpoints publish no x402 ' +
    'payment options, so circle_pay_service can never be used on them.',

  circle_get_gateway_balance:
    "Check the wallet's Circle Gateway balance: the off-chain batched-payment pool, " +
    'separate from the on-chain wallet balance reported by circle_get_balance. Defaults to ' +
    'Base; pass chain "POLYGON" to read the Polygon Gateway balance.',

  circle_pay_service: (dataField: 'data' | 'dataJson'): string =>
    'Pay for an x402 service with a Circle USDC payment. The kit reads the ' +
    "service's published payment options and pays under the right scheme automatically: " +
    'vanilla x402, or Circle Gateway when the seller requires it. It also picks the chain: ' +
    'Base when the seller offers it, otherwise Polygon (the kit supports Base and Polygon). ' +
    'If the seller requires Gateway and the wallet has no Gateway balance, this fails with an ' +
    'actionable message: call circle_gateway_deposit for the same URL, then retry circle_pay_service. ' +
    `Pass the \`method\` from circle_inspect_service: a GET service reads ${dataField} as URL ` +
    'query parameters, a POST/PUT/PATCH service reads it as a JSON body. Sending the wrong ' +
    'one makes the server see no input and still spends USDC, so always copy the inspected method.',

  circle_gateway_deposit:
    "Fund the wallet's Circle Gateway balance so it can pay a seller that requires " +
    'Gateway (batched) x402 payments. Pass the service URL; the kit confirms the seller ' +
    'requires Gateway and picks the chain (Base preferred, else Polygon), then deposits on ' +
    'that chain. Method auto-selected: Polygon sellers use the fast eco path (~30s, no gas on ' +
    "source, USDC sourced from the wallet's Base USDC balance and landed in the Polygon " +
    'Gateway pool); Base sellers use direct (13-19 min, consumes gas on Base). Spends USDC ' +
    '(the deposit amount plus fee) and pauses for human approval. After it succeeds, retry ' +
    'circle_pay_service for the same URL.',

  circle_login:
    'Log in to the Circle agent wallet via email + OTP, or confirm an existing session. ' +
    'Use this whenever the user wants to log in or log back in, or when another tool fails ' +
    'because the session is missing or expired. The kit prompts the user in the terminal ' +
    'for their email and the OTP from their inbox (never stored); it does not accept the ' +
    'Terms of Use on their behalf. If a session is already valid this is a no-op that ' +
    'reports so. After it succeeds, retry whatever the user originally asked for.',

  circle_logout:
    'Log out of the Circle agent wallet and clear the stored credentials. Use this when the ' +
    'user wants to log out or switch accounts. Safe to call when no session exists (reports ' +
    'that nothing was logged out). After this, the user must circle_login again before any ' +
    'wallet or payment tool will work.',
} as const;

/** Discriminated result of a preflight step: a chosen chain, or an error to surface. */
export type ChainSelection = { ok: true; chain: Chain } | { ok: false; message: string };

/** Discriminated result of a check that either passes or yields an error to surface. */
export type PreflightCheck = { ok: true } | { ok: false; message: string };

/**
 * Confirm the seller publishes a payment option on a chain the kit can pay, and
 * pick which chain to use. Base is preferred; Polygon is the fallback when the
 * seller offers no Base option. A Solana- or Ethereum-only service is rejected
 * with the networks it actually offers. Logs the failure line itself; the
 * caller decides whether to return or throw the message.
 */
export async function selectPayChain(
  url: string,
  method: string,
  log: (line: string) => void,
): Promise<ChainSelection> {
  try {
    const accepts = await getServiceAccepts(url, method);
    const picked = preferredChain(accepts);
    if (!picked) {
      const offered = accepts.unsupportedNetworks.join(', ') || 'none';
      log(`circle_pay_service ✗ no supported pay option (seller offers: ${offered})`);
      return {
        ok: false,
        message:
          `This service offers no payment option on a chain the kit supports (Base or Polygon). ` +
          `Seller networks: ${offered}.`,
      };
    }
    return { ok: true, chain: picked };
  } catch (e) {
    log(`circle_pay_service ✗ ${(e as Error).message}`);
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * Confirm the seller requires a Gateway payment on a chain the kit can pay, and
 * pick which chain to deposit on. For a vanilla-x402 seller a deposit would not
 * help, so that is rejected. Logs the failure line itself.
 */
export async function selectGatewayChain(
  url: string,
  method: string,
  log: (line: string) => void,
): Promise<ChainSelection> {
  try {
    const accepts = await getServiceAccepts(url, method);
    const picked = preferredChain(accepts);
    if (!picked || !sellerRequiresGateway(accepts, picked)) {
      log(`circle_gateway_deposit ✗ seller offers no Gateway option on a supported chain`);
      return {
        ok: false,
        message:
          `${url} does not require a Circle Gateway payment on a chain the kit supports, so a ` +
          'Gateway deposit would not help. Pay it with circle_pay_service directly.',
      };
    }
    return { ok: true, chain: picked };
  } catch (e) {
    log(`circle_gateway_deposit ✗ ${(e as Error).message}`);
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * Pre-flight for a payment: a counterfactual (undeployed) SCA cannot sign an
 * x402 payment, and deployment is per-chain, so check the chain being paid.
 * Surfaces an actionable message instead of the CLI's opaque "Could not sign
 * payment authorization" failure. Detection is best-effort: a flaky RPC must
 * not block a real payment, so a detection error is logged and treated as a
 * pass.
 */
export async function ensureDeployed(
  address: string,
  chain: Chain,
  log: (line: string) => void,
): Promise<PreflightCheck> {
  try {
    if (!(await isWalletDeployed({ address, chain }))) {
      log(`circle_pay_service ✗ wallet not deployed on ${chain}`);
      return {
        ok: false,
        message:
          `Wallet ${address} is not deployed on-chain on ${chainLabel(chain)} yet, so it ` +
          `cannot sign x402 payments there. Call circle_deploy_wallet with this address and ` +
          `chain "${chain}" first, then retry circle_pay_service.`,
      };
    }
    return { ok: true };
  } catch (e) {
    log(`circle_pay_service: deployment check skipped (${(e as Error).message})`);
    return { ok: true };
  }
}

/**
 * Pick the Gateway deposit method for a chain. Polygon Gateway sellers get the
 * fast (~30s) eco method, which sources Base USDC and lands on Polygon. Base
 * Gateway sellers must use direct (13-19 min) because eco's destination is
 * hardcoded to Polygon by the CLI.
 */
export function selectDepositMethod(chain: Chain): GatewayDepositMethod {
  return chain === 'POLYGON' ? 'eco' : 'direct';
}

/**
 * Prompt the user to approve or reject a spend tool before it touches USDC, for
 * the frameworks whose tool API has no external approval hook (so the
 * human-in-the-loop lives inside the spend tool's execute). The agent calls the
 * tool normally, execution pauses on `await ask(...)`, and only proceeds after
 * the human approves. Returns true when approved.
 */
export async function approveSpend(
  ask: (q: string) => Promise<string>,
  name: string,
  args: Record<string, unknown>,
  log: (line: string) => void,
): Promise<boolean> {
  log(yellow(`approval required for tool: ${bold(name)}`));
  console.log(colorizeJson(args));
  const answer = (await ask(bold('Approve this action? [y/N] '))).trim().toLowerCase();
  const approved = answer === 'y' || answer === 'yes';
  log(approved ? green('approved by user') : red('rejected by user'));
  return approved;
}
