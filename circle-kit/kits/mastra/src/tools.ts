import { createTool } from '@mastra/core/tools';
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

const chainEnum = z.enum(['BASE', 'POLYGON']);

function log(line: string): void {
  console.log(toolLine(line));
}

export const fetchSetupSkillTool = createTool({
  id: 'fetch_setup_skill',
  description: TOOL_DESCRIPTIONS.fetch_setup_skill,
  inputSchema: z.object({}),
  execute: async () => {
    log(`fetch_setup_skill → ${SETUP_SKILL_URL}`);
    try {
      const body = await fetchSetupSkill();
      log(`fetch_setup_skill ← ${body.length} bytes`);
      return body;
    } catch (e) {
      log(`fetch_setup_skill ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

const subSkillEnum = z.enum(SUB_SKILL_NAMES as [SubSkillName, ...SubSkillName[]]);

export const fetchSubSkillTool = createTool({
  id: 'fetch_sub_skill',
  description: TOOL_DESCRIPTIONS.fetch_sub_skill,
  inputSchema: z.object({
    name: subSkillEnum.describe('Sub-skill name, without the .md extension.'),
  }),
  execute: async (input) => {
    log(`fetch_sub_skill name=${input.name}`);
    try {
      const body = await fetchSubSkill(input.name);
      log(`fetch_sub_skill ← ${body.length} bytes`);
      return body;
    } catch (e) {
      log(`fetch_sub_skill ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleCreateWallet = createTool({
  id: 'circle_create_wallet',
  description: TOOL_DESCRIPTIONS.circle_create_wallet,
  inputSchema: z.object({}),
  execute: async () => {
    log(`circle_create_wallet`);
    try {
      const result = await createWallet();
      log(`circle_create_wallet ← ${(result as { address: string }).address}`);
      return result;
    } catch (e) {
      log(`circle_create_wallet ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleListWallets = createTool({
  id: 'circle_list_wallets',
  description: TOOL_DESCRIPTIONS.circle_list_wallets,
  inputSchema: z.object({}),
  execute: async () => {
    log(`circle_list_wallets`);
    try {
      const result = await listWallets();
      log(`circle_list_wallets ← ${(result as unknown[]).length} wallet(s)`);
      return result;
    } catch (e) {
      log(`circle_list_wallets ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleGetBalance = createTool({
  id: 'circle_get_balance',
  description: TOOL_DESCRIPTIONS.circle_get_balance,
  inputSchema: z.object({
    address: z.string().describe('EVM wallet address (0x...).'),
    chain: chainEnum.optional().describe('Chain to read the balance on. Defaults to BASE.'),
  }),
  execute: async (input) => {
    log(`circle_get_balance address=${input.address} chain=${input.chain ?? 'BASE'}`);
    try {
      const result = await getBalance({ address: input.address, chain: input.chain as Chain | undefined });
      const tokens = (result as { tokens: Array<{ symbol?: string; amount?: string }> }).tokens;
      const usdc = tokens.find((t) => t.symbol?.toUpperCase() === 'USDC');
      log(`circle_get_balance ← USDC=${usdc?.amount ?? '0'} (${tokens.length} token(s))`);
      return result;
    } catch (e) {
      log(`circle_get_balance ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleDeployWallet = createTool({
  id: 'circle_deploy_wallet',
  description: TOOL_DESCRIPTIONS.circle_deploy_wallet,
  inputSchema: z.object({
    address: z.string().describe('Agent wallet address to deploy (0x...).'),
    chain: chainEnum.optional().describe('Chain to deploy the SCA on. Defaults to BASE.'),
  }),
  execute: async (input) => {
    log(`circle_deploy_wallet address=${input.address} chain=${input.chain ?? 'BASE'}`);
    try {
      const result = await deployWallet({ address: input.address, chain: input.chain as Chain | undefined });
      if (result.alreadyDeployed) {
        log(`circle_deploy_wallet ← already deployed`);
      } else if (result.deployed) {
        log(`circle_deploy_wallet ← deployed tx=${result.txId ?? 'n/a'}`);
      } else {
        log(`circle_deploy_wallet ← submitted, on-chain confirmation pending tx=${result.txId ?? 'n/a'}`);
      }
      return result;
    } catch (e) {
      log(`circle_deploy_wallet ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const fundFiatTool = createTool({
  id: 'circle_fund_fiat',
  description: TOOL_DESCRIPTIONS.circle_fund_fiat,
  inputSchema: z.object({
    address: z.string().describe('Destination agent wallet address (0x...).'),
    amount: z.number().positive().describe('Amount of token to buy, in human units (e.g. 10 for $10 of USDC).'),
    chain: chainEnum.optional().describe('Chain the funds deposit on. Defaults to BASE.'),
    token: z
      .enum(['usdc', 'eurc', 'eth', 'native'])
      .optional()
      .describe('Token to buy. Defaults to usdc.'),
  }),
  execute: async (input) => {
    log(`circle_fund_fiat address=${input.address} amount=${input.amount} chain=${input.chain ?? 'BASE'} token=${input.token ?? 'usdc'}`);
    try {
      const result = await fundWalletFiat({ address: input.address, amount: input.amount, chain: input.chain, token: input.token, open: true });
      log(`circle_fund_fiat ← ${preview(result.url, 80)}`);
      return result;
    } catch (e) {
      log(`circle_fund_fiat ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const fetchServiceTool = createTool({
  id: 'fetch_service',
  description: TOOL_DESCRIPTIONS.fetch_service,
  inputSchema: z.object({
    url: z.string().describe('The service endpoint URL to GET.'),
  }),
  execute: async (input) => {
    log(`fetch_service url=${input.url}`);
    try {
      const result = await fetchService({ url: input.url });
      if (result.paymentRequired) {
        log(`fetch_service ← HTTP 402, payment required`);
      } else {
        log(`fetch_service ← HTTP ${result.status} ${result.body.length} bytes`);
      }
      return result;
    } catch (e) {
      log(`fetch_service ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleSearchServices = createTool({
  id: 'circle_search_services',
  description: TOOL_DESCRIPTIONS.circle_search_services,
  inputSchema: z.object({
    keyword: z.string().describe('Search keyword, e.g. "weather", "image", "geocode".'),
  }),
  execute: async (input) => {
    log(`circle_search_services keyword="${input.keyword}"`);
    try {
      const result = await searchServices({ keyword: input.keyword });
      log(`circle_search_services ← ${(result as unknown[]).length} hit(s)`);
      return result;
    } catch (e) {
      log(`circle_search_services ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleInspectService = createTool({
  id: 'circle_inspect_service',
  description: TOOL_DESCRIPTIONS.circle_inspect_service,
  inputSchema: z.object({
    url: z.string().describe('The service URL returned by circle_search_services.'),
  }),
  execute: async (input) => {
    log(`circle_inspect_service url=${input.url}`);
    try {
      const result = await inspectService({ url: input.url });
      log(`circle_inspect_service ← ${preview(JSON.stringify(result))}`);
      return result;
    } catch (e) {
      log(`circle_inspect_service ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleGetGatewayBalance = createTool({
  id: 'circle_get_gateway_balance',
  description: TOOL_DESCRIPTIONS.circle_get_gateway_balance,
  inputSchema: z.object({
    address: z.string().describe('EVM wallet address (0x...).'),
    chain: chainEnum.optional().describe('Chain to read the Gateway balance on. Defaults to BASE.'),
  }),
  execute: async (input) => {
    log(`circle_get_gateway_balance address=${input.address} chain=${input.chain ?? 'BASE'}`);
    try {
      const result = await gatewayBalance({ address: input.address, chain: input.chain as Chain | undefined });
      log(`circle_get_gateway_balance ← total=${result.total} USDC`);
      return result;
    } catch (e) {
      log(`circle_get_gateway_balance ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

/**
 * Build the tools that need the demo's terminal `ask`: the two spend tools
 * (which pause for human approval before touching USDC) and the login/logout
 * tools (which prompt for email + OTP, never stored). Every other tool is a
 * plain module-level export that needs no interaction.
 */
export function buildInteractiveTools(ask: (q: string) => Promise<string>) {
  const circlePayService = createTool({
    id: 'circle_pay_service',
    description: TOOL_DESCRIPTIONS.circle_pay_service('data'),
    inputSchema: z.object({
      url: z.string().describe('The service URL to pay'),
      address: z.string().describe('The wallet address to pay from'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
        .optional()
        .describe(
          "HTTP method the service expects, copied from circle_inspect_service's `method` " +
            'field. Defaults to GET if omitted.',
        ),
      data: z
        .record(z.string(), z.unknown())
        .describe(
          'Payload object matching the service input schema. For a GET service these become ' +
            'query parameters; for POST/PUT/PATCH they become the JSON request body.',
        ),
    }),
    execute: async (input) => {
      const httpMethod = (input.method ?? 'GET').toUpperCase();
      log(`circle_pay_service url=${input.url} from=${input.address} method=${httpMethod}`);

      // Human-in-the-loop: pause for approval before any USDC is spent.
      if (
        !(await approveSpend(ask, 'circle_pay_service', {
          url: input.url,
          address: input.address,
          method: httpMethod,
          data: input.data,
        }, log))
      ) {
        return { denied: true, message: 'Payment rejected by user.' };
      }

      const picked = await selectPayChain(input.url, httpMethod, log);
      if (!picked.ok) throw new Error(picked.message);
      const chain = picked.chain;

      const deployed = await ensureDeployed(input.address, chain, log);
      if (!deployed.ok) throw new Error(deployed.message);

      try {
        const result = await payService({
          url: input.url,
          address: input.address,
          data: input.data,
          method: httpMethod,
          chain,
        });
        const tx = (result as { txHash?: string }).txHash
          ? ` txHash=${(result as { txHash?: string }).txHash}`
          : '';
        log(`circle_pay_service ← paid on ${chainLabel(chain)}${tx}`);
        return result;
      } catch (e) {
        log(`circle_pay_service ✗ ${(e as Error).message}`);
        throw e;
      }
    },
  });

  const circleGatewayDeposit = createTool({
    id: 'circle_gateway_deposit',
    description: TOOL_DESCRIPTIONS.circle_gateway_deposit,
    inputSchema: z.object({
      url: z.string().describe('The service URL this deposit is for.'),
      address: z.string().describe('Agent wallet address to deposit from (0x...).'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
        .optional()
        .describe(
          "HTTP method the service expects, copied from circle_inspect_service's `method` " +
            "field. Needed so the seller's Gateway requirement is read with the right " +
            'method (a POST-only endpoint answers 405 to a GET probe). Defaults to GET.',
        ),
      amount: z
        .number()
        .positive()
        .describe(
          'USDC amount to move into Gateway. Size it to cover the expected paid calls ' +
            'plus the ~$0.03 fee; a Gateway minimum deposit may apply.',
        ),
    }),
    execute: async (input) => {
      const httpMethod = (input.method ?? 'GET').toUpperCase();
      log(`circle_gateway_deposit url=${input.url} address=${input.address} amount=${input.amount}`);

      // Human-in-the-loop: pause for approval before any USDC is spent.
      if (
        !(await approveSpend(ask, 'circle_gateway_deposit', {
          url: input.url,
          address: input.address,
          method: httpMethod,
          amount: input.amount,
        }, log))
      ) {
        return { denied: true, message: 'Gateway deposit rejected by user.' };
      }

      const picked = await selectGatewayChain(input.url, httpMethod, log);
      if (!picked.ok) throw new Error(picked.message);
      const chain = picked.chain;

      const depositMethod = selectDepositMethod(chain);
      try {
        const result = await gatewayDeposit({
          address: input.address,
          amount: input.amount,
          chain,
          method: depositMethod,
        });
        log(
          `circle_gateway_deposit ← ${result.amount} USDC on ${chainLabel(chain)} via ${depositMethod} tx=${result.txId ?? 'n/a'}`,
        );
        return result;
      } catch (e) {
        log(`circle_gateway_deposit ✗ ${(e as Error).message}`);
        throw e;
      }
    },
  });

  const loginTool = createTool({
    id: 'circle_login',
    description: TOOL_DESCRIPTIONS.circle_login,
    inputSchema: z.object({}),
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
        throw e;
      }
    },
  });

  const logoutTool = createTool({
    id: 'circle_logout',
    description: TOOL_DESCRIPTIONS.circle_logout,
    inputSchema: z.object({}),
    execute: async () => {
      log('circle_logout');
      try {
        logout(log);
        return { message: 'Logged out; Circle credentials cleared.' };
      } catch (e) {
        log(`circle_logout ✗ ${(e as Error).message}`);
        throw e;
      }
    },
  });

  return { circlePayService, circleGatewayDeposit, loginTool, logoutTool };
}
