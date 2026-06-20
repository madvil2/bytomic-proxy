import { tool } from 'ai';
import { z } from 'zod';
import {
  createWallet,
  listWallets,
  getBalance,
  deployWallet,
  fundWalletFiat,
  gatewayBalance,
  gatewayDeposit,
  searchServices,
  inspectService,
  fetchService,
  payService,
  chainLabel,
  ensureSession,
  logout,
  type Chain,
  runCircle,
} from '@agent-stack-ecosystem-kits/circle-tools';
import {
  fetchSetupSkill,
  fetchSubSkill,
  SETUP_SKILL_URL,
  SUB_SKILL_NAMES,
  type SubSkillName,
} from '@agent-stack-ecosystem-kits/kit-core/skill';
import {
  TOOL_DESCRIPTIONS,
  preview,
  approveSpend,
  selectPayChain,
  selectGatewayChain,
  ensureDeployed,
  selectDepositMethod,
} from '@agent-stack-ecosystem-kits/kit-core/tools';
import { bold, toolLine } from './theme';

export type AskFn = (q: string) => Promise<string>;

const chainEnum = z.enum(['BASE', 'POLYGON']);

function log(line: string): void {
  console.log(toolLine(line));
}

/**
 * Helper to format a caught error for return.
 *
 * In the Vercel AI SDK, when a tool's `execute` function *throws*, the error
 * bubbles up through `generateText` all the way to the caller — the model never
 * sees it and the process crashes. Returning `{ error }` instead gives the model
 * the failure information as a tool result so it can diagnose and recover without
 * any external retry or interruption mechanism.
 */
function toolError(e: unknown): { error: string } {
  return { error: e instanceof Error ? e.message : String(e) };
}

/**
 * Build the Vercel AI SDK tool set.
 *
 * The `ask` parameter is threaded into the two spend tools
 * (circle_pay_service, circle_gateway_deposit) so they can pause and ask the
 * human for approval before touching USDC.
 */
export function buildTools(ask: AskFn) {
  const subSkillEnum = z.enum(SUB_SKILL_NAMES as [SubSkillName, ...SubSkillName[]]);

  return {
    // ── Auth tools ────────────────────────────────────────────────────────────

    circle_login: tool({
      description: TOOL_DESCRIPTIONS.circle_login,
      parameters: z.object({}),
      execute: async () => {
        log('circle_login');
        try {
          const result = await ensureSession({ ask, log, bold });
          const message =
            result.status === 'already-valid'
              ? 'Already logged in; the Circle session is valid.'
              : 'Logged in. The Circle session is now valid.';
          log(`circle_login ← ${result.status}`);
          return { status: result.status, message };
        } catch (e) {
          log(`circle_login ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_logout: tool({
      description: TOOL_DESCRIPTIONS.circle_logout,
      parameters: z.object({}),
      execute: async () => {
        log('circle_logout');
        try {
          logout(log);
          return { message: 'Logged out; Circle credentials cleared.' };
        } catch (e) {
          log(`circle_logout ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    // ── Skill fetchers ────────────────────────────────────────────────────────

    fetch_setup_skill: tool({
      description: TOOL_DESCRIPTIONS.fetch_setup_skill,
      parameters: z.object({}),
      execute: async () => {
        log(`fetch_setup_skill → ${SETUP_SKILL_URL}`);
        try {
          const body = await fetchSetupSkill();
          log(`fetch_setup_skill ← ${body.length} bytes`);
          return body;
        } catch (e) {
          log(`fetch_setup_skill ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    fetch_sub_skill: tool({
      description: TOOL_DESCRIPTIONS.fetch_sub_skill,
      parameters: z.object({
        name: subSkillEnum.describe('Sub-skill name, without the .md extension.'),
      }),
      execute: async ({ name }) => {
        log(`fetch_sub_skill name=${name}`);
        try {
          const body = await fetchSubSkill(name);
          log(`fetch_sub_skill ← ${body.length} bytes`);
          return body;
        } catch (e) {
          log(`fetch_sub_skill ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    // ── Wallet tools ──────────────────────────────────────────────────────────

    circle_list_wallets: tool({
      description: TOOL_DESCRIPTIONS.circle_list_wallets,
      parameters: z.object({}),
      execute: async () => {
        log(`circle_list_wallets`);
        try {
          const result = await listWallets();
          log(`circle_list_wallets ← ${(result as unknown[]).length} wallet(s)`);
          return result;
        } catch (e) {
          log(`circle_list_wallets ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_create_wallet: tool({
      description: TOOL_DESCRIPTIONS.circle_create_wallet,
      parameters: z.object({}),
      execute: async () => {
        log(`circle_create_wallet`);
        try {
          const result = await createWallet();
          log(`circle_create_wallet ← ${(result as { address: string }).address}`);
          return result;
        } catch (e) {
          log(`circle_create_wallet ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_get_balance: tool({
      description: TOOL_DESCRIPTIONS.circle_get_balance,
      parameters: z.object({
        address: z.string().describe('EVM wallet address (0x...).'),
        chain: chainEnum.nullable().describe('Chain to read the balance on. Defaults to BASE.'),
      }),
      execute: async ({ address, chain }) => {
        log(`circle_get_balance address=${address} chain=${chain ?? 'BASE'}`);
        try {
          const result = await getBalance({ address, chain: (chain ?? undefined) as Chain | undefined });
          const tokens = (result as { tokens: Array<{ symbol?: string; amount?: string }> }).tokens;
          const usdc = tokens.find((t) => t.symbol?.toUpperCase() === 'USDC');
          log(`circle_get_balance ← USDC=${usdc?.amount ?? '0'} (${tokens.length} token(s))`);
          return result;
        } catch (e) {
          log(`circle_get_balance ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_deploy_wallet: tool({
      description: TOOL_DESCRIPTIONS.circle_deploy_wallet,
      parameters: z.object({
        address: z.string().describe('Agent wallet address to deploy (0x...).'),
        chain: chainEnum.nullable().describe('Chain to deploy the SCA on. Defaults to BASE.'),
      }),
      execute: async ({ address, chain }) => {
        log(`circle_deploy_wallet address=${address} chain=${chain ?? 'BASE'}`);
        try {
          const result = await deployWallet({ address, chain: (chain ?? undefined) as Chain | undefined });
          if (result.alreadyDeployed) {
            log(`circle_deploy_wallet ← already deployed`);
          } else if (result.deployed) {
            log(`circle_deploy_wallet ← deployed tx=${result.txId ?? 'n/a'}`);
          } else {
            log(
              `circle_deploy_wallet ← submitted, on-chain confirmation pending tx=${result.txId ?? 'n/a'}`,
            );
          }
          return result;
        } catch (e) {
          log(`circle_deploy_wallet ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_wallet_fund: tool({
      description:
        'Fund an agent wallet with testnet USDC using the Circle faucet (BASE only). ' +
        'Use method="crypto" for the free testnet faucet (recommended for demos). ' +
        'Use method="fiat" for the test card flow.',
      parameters: z.object({
        address: z.string().describe('The wallet address to fund'),
        method: z
          .enum(['crypto', 'fiat'])
          .describe('"crypto" uses the testnet faucet (default); "fiat" uses a test card.'),
      }),
      execute: async ({ address, method }) => {
        log(`circle_wallet_fund address=${address} method=${method}`);
        try {
          const out = runCircle([
            'wallet',
            'fund',
            '--address',
            address,
            '--chain',
            '--method',
            method,
            '--output',
            'json',
          ]);
          log(`circle_wallet_fund ← done`);
          return out;
        } catch (e) {
          log(`circle_wallet_fund ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_fund_fiat: tool({
      description: TOOL_DESCRIPTIONS.circle_fund_fiat,
      parameters: z.object({
        address: z.string().describe('Destination agent wallet address (0x...).'),
        amount: z.number().positive().describe('Amount of token to buy, in human units (e.g. 10 for $10 of USDC).'),
      
        chain: z
          .enum(['BASE', 'POLYGON'])
          .describe('Chain the funds deposit on. Defaults to BASE.'),
        token: z
          .enum(['usdc', 'eurc', 'eth', 'native'])
          .describe('Token to buy. Defaults to usdc.'),
      }),
      execute: async ({ address, amount, chain, token }) => {
        log(`circle_fund_fiat address=${address} amount=${amount} chain=${chain ?? 'BASE'} token=${token ?? 'usdc'}`);
        try {
          const result = await fundWalletFiat({ address, amount, chain: chain as Chain | undefined, token, open: true });
          log(`circle_fund_fiat ← ${preview(result.url, 80)}`);
          return result;
        } catch (e) {
          log(`circle_fund_fiat ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    // ── Service discovery tools ───────────────────────────────────────────────

    circle_search_services: tool({
      description: TOOL_DESCRIPTIONS.circle_search_services,
      parameters: z.object({
        keyword: z.string().describe('Search keyword, e.g. "weather", "image", "geocode".'),
      }),
      execute: async ({ keyword }) => {
        log(`circle_search_services keyword="${keyword}"`);
        try {
          const result = await searchServices({ keyword });
          log(`circle_search_services ← ${(result as unknown[]).length} hit(s)`);
          return result;
        } catch (e) {
          log(`circle_search_services ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_inspect_service: tool({
      description: TOOL_DESCRIPTIONS.circle_inspect_service,
      parameters: z.object({
        url: z.string().describe('The service URL returned by circle_search_services.'),
      }),
      execute: async ({ url }) => {
        log(`circle_inspect_service url=${url}`);
        try {
          const result = await inspectService({ url });
          log(`circle_inspect_service ← ${preview(JSON.stringify(result))}`);
          return result;
        } catch (e) {
          log(`circle_inspect_service ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    fetch_service: tool({
      description: TOOL_DESCRIPTIONS.fetch_service,
      parameters: z.object({
        url: z.string().describe('The service endpoint URL to GET.'),
      }),
      execute: async ({ url }) => {
        log(`fetch_service url=${url}`);
        try {
          const result = await fetchService({ url });
          if (result.paymentRequired) {
            log(`fetch_service ← HTTP 402, payment required`);
          } else {
            log(`fetch_service ← HTTP ${result.status} ${result.body.length} bytes`);
          }
          return result;
        } catch (e) {
          log(`fetch_service ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    circle_get_gateway_balance: tool({
      description: TOOL_DESCRIPTIONS.circle_get_gateway_balance,
      parameters: z.object({
        address: z.string().describe('EVM wallet address (0x...).'),
        chain: chainEnum.nullable().describe('Chain to read the Gateway balance on. Defaults to BASE.'),
      }),
      execute: async ({ address, chain }) => {
        log(`circle_get_gateway_balance address=${address} chain=${chain ?? 'BASE'}`);
        try {
          const result = await gatewayBalance({ address, chain: (chain ?? undefined) as Chain | undefined });
          log(`circle_get_gateway_balance ← total=${result.total} USDC`);
          return result;
        } catch (e) {
          log(`circle_get_gateway_balance ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),

    // ── Spend tools — require human approval before executing ─────────────────

    circle_pay_service: tool({
      description: TOOL_DESCRIPTIONS.circle_pay_service('data'),
      parameters: z.object({
        url: z.string().describe('The service URL to pay'),
        address: z.string().describe('The wallet address to pay from'),
        method: z
          .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
          .describe(
            "HTTP method the service expects, copied from circle_inspect_service's `method` " +
              'field. Defaults to GET if omitted.',
          ),
        data: z
          .string()
          .describe(
            'JSON-encoded payload object matching the service input schema. For a GET service ' +
              'these become query parameters; for POST/PUT/PATCH they become the JSON request body. ' +
              'Pass "{}" if no payload is needed.',
          ),
      }),
      execute: async ({ url, address, method, data }) => {
        const httpMethod = (method ?? 'GET').toUpperCase();
        const parsedData = JSON.parse(data) as Record<string, unknown>;
        log(`circle_pay_service url=${url} from=${address} method=${httpMethod}`);

        if (!(await approveSpend(ask, 'circle_pay_service', { url, address, method: httpMethod, data: parsedData }, log))) {
          return { denied: true, message: 'Payment rejected by user.' };
        }

        const picked = await selectPayChain(url, httpMethod, log);
        if (!picked.ok) return { error: picked.message };
        const chain = picked.chain;

        const deployed = await ensureDeployed(address, chain, log);
        if (!deployed.ok) return { error: deployed.message };

        try {
          const result = await payService({ url, address, data: parsedData, method: httpMethod, chain });
          const tx = (result as { txHash?: string }).txHash
            ? ` txHash=${(result as { txHash?: string }).txHash}`
            : '';
          log(`circle_pay_service ← paid on ${chainLabel(chain)}${tx}`);
          return result;
        } catch (e) {
          log(`circle_pay_service ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),


    circle_gateway_deposit: tool({
      description: TOOL_DESCRIPTIONS.circle_gateway_deposit,
      parameters: z.object({
        url: z.string().describe('The service URL this deposit is for.'),
        address: z.string().describe('Agent wallet address to deposit from (0x...).'),
        method: z
          .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
          .describe(
            "HTTP method the service expects, copied from circle_inspect_service's `method` " +
              "field. Needed so the seller's Gateway requirement is read with the right " +
              'method (a POST-only endpoint answers 405 to a GET probe). Defaults to GET.',
          ),
        deposit_method: z
          .enum(['eco', 'direct'])
          .describe(
            '"eco" routes Base→Polygon Gateway (~30-50 s, $0.03 flat fee) — the right ' +
              'default for nearly all cases. "direct" deposits on-chain on the source chain ' +
              '(~13-19 min on Base, ~8 s on Polygon/Avalanche). Only use "direct" when the ' +
              'source is not Base, the seller requires a non-Polygon chain, or explicitly requested.',
          ),
        amount: z
          .number()
          .positive()
          .describe(
            'USDC amount to move into Gateway. Size it to cover the expected paid calls ' +
              'plus the ~$0.03 fee; a Gateway minimum deposit may apply.',
          ),
      }),
      execute: async ({ url, address, method, amount }) => {
        const httpMethod = (method ?? 'GET').toUpperCase();
        log(`circle_gateway_deposit url=${url} address=${address} amount=${amount}`);

        // Human-in-the-loop: pause for approval before any USDC is spent.
        if (
          !(await approveSpend(ask, 'circle_gateway_deposit', {
            url,
            address,
            method: httpMethod,
            amount,
          }, log))
        ) {
          return { denied: true, message: 'Gateway deposit rejected by user.' };
        }

        const picked = await selectGatewayChain(url, httpMethod, log);
        if (!picked.ok) return { error: picked.message };
        const chain = picked.chain;

        const depositMethod = selectDepositMethod(chain);
        try {
          const result = await gatewayDeposit({ address, amount, chain, method: depositMethod });
          log(
            `circle_gateway_deposit ← ${result.amount} USDC on ${chainLabel(chain)} via ${depositMethod} tx=${result.txId ?? 'n/a'}`,
          );
          return result;
        } catch (e) {
          log(`circle_gateway_deposit ✗ ${(e as Error).message}`);
          return toolError(e);
        }
      },
    }),
  };
}

export type CircleTools = ReturnType<typeof buildTools>;
