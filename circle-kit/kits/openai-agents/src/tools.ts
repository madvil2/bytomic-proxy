import { tool } from '@openai/agents';
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

function preview(value: string, max = 120): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

// Cap skill markdown returned to the model. These files can exceed 26 KB;
// the actionable steps are always near the top, and oversized responses
// balloon the conversation history across turns causing TPM 429s.
const MAX_SKILL_CHARS = 8_000;

function capSkill(body: string, name: string): string {
  if (body.length <= MAX_SKILL_CHARS) return body;
  return (
    body.slice(0, MAX_SKILL_CHARS) +
    `\n\n[...${body.length - MAX_SKILL_CHARS} chars omitted — re-fetch ${name} if you need the rest]`
  );
}

export const fetchSetupSkillTool = tool({
  name: 'fetch_setup_skill',
  description: TOOL_DESCRIPTIONS.fetch_setup_skill,
  parameters: z.object({}),
  execute: async () => {
    log(`fetch_setup_skill → ${SETUP_SKILL_URL}`);
    try {
      const body = await fetchSetupSkill();
      log(`fetch_setup_skill ← ${body.length} bytes`);
      return capSkill(body, 'fetch_setup_skill');
    } catch (e) {
      log(`fetch_setup_skill ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

const subSkillEnum = z.enum(SUB_SKILL_NAMES as [SubSkillName, ...SubSkillName[]]);

export const fetchSubSkillTool = tool({
  name: 'fetch_sub_skill',
  description: TOOL_DESCRIPTIONS.fetch_sub_skill,
  parameters: z.object({
    name: subSkillEnum.describe('Sub-skill name, without the .md extension.'),
  }),
  execute: async ({ name }) => {
    log(`fetch_sub_skill name=${name}`);
    try {
      const body = await fetchSubSkill(name);
      log(`fetch_sub_skill ← ${body.length} bytes`);
      return capSkill(body, `fetch_sub_skill(${name})`);
    } catch (e) {
      log(`fetch_sub_skill ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleCreateWallet = tool({
  name: 'circle_create_wallet',
  description: TOOL_DESCRIPTIONS.circle_create_wallet,
  parameters: z.object({}),
  execute: async () => {
    log(`circle_create_wallet`);
    try {
      const result = await createWallet();
      log(`circle_create_wallet ← ${(result as { address: string }).address}`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_create_wallet ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleListWallets = tool({
  name: 'circle_list_wallets',
  description: TOOL_DESCRIPTIONS.circle_list_wallets,
  parameters: z.object({}),
  execute: async () => {
    log(`circle_list_wallets`);
    try {
      const result = await listWallets();
      log(`circle_list_wallets ← ${(result as unknown[]).length} wallet(s)`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_list_wallets ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleGetBalance = tool({
  name: 'circle_get_balance',
  description: TOOL_DESCRIPTIONS.circle_get_balance,
  parameters: z.object({
    address: z.string().describe('EVM wallet address (0x...).'),
    chain: chainEnum.optional().describe('Chain to read the balance on. Defaults to BASE.'),
  }),
  execute: async ({ address, chain }) => {
    log(`circle_get_balance address=${address} chain=${chain ?? 'BASE'}`);
    try {
      const result = await getBalance({ address, chain: chain as Chain | undefined });
      const tokens = (result as { tokens: Array<{ symbol?: string; amount?: string }> }).tokens;
      const usdc = tokens.find((t) => t.symbol?.toUpperCase() === 'USDC');
      log(`circle_get_balance ← USDC=${usdc?.amount ?? '0'} (${tokens.length} token(s))`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_get_balance ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleDeployWallet = tool({
  name: 'circle_deploy_wallet',
  description: TOOL_DESCRIPTIONS.circle_deploy_wallet,
  parameters: z.object({
    address: z.string().describe('Agent wallet address to deploy (0x...).'),
    chain: chainEnum.optional().describe('Chain to deploy the SCA on. Defaults to BASE.'),
  }),
  execute: async ({ address, chain }) => {
    log(`circle_deploy_wallet address=${address} chain=${chain ?? 'BASE'}`);
    try {
      const result = await deployWallet({ address, chain: chain as Chain | undefined });
      if (result.alreadyDeployed) {
        log(`circle_deploy_wallet ← already deployed`);
      } else if (result.deployed) {
        log(`circle_deploy_wallet ← deployed tx=${result.txId ?? 'n/a'}`);
      } else {
        log(`circle_deploy_wallet ← submitted, on-chain confirmation pending tx=${result.txId ?? 'n/a'}`);
      }
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_deploy_wallet ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const fundFiatTool = tool({
  name: 'circle_fund_fiat',
  description: TOOL_DESCRIPTIONS.circle_fund_fiat,
  parameters: z.object({
    address: z.string().describe('Destination agent wallet address (0x...).'),
    amount: z.number().positive().describe('Amount of token to buy, in human units (e.g. 10 for $10 of USDC).'),
    chain: chainEnum.optional().describe('Chain the funds deposit on. Defaults to BASE.'),
    token: z
      .enum(['usdc', 'eurc', 'eth', 'native'])
      .optional()
      .describe('Token to buy. Defaults to usdc.'),
  }),
  execute: async ({ address, amount, chain, token }) => {
    log(`circle_fund_fiat address=${address} amount=${amount} chain=${chain ?? 'BASE'} token=${token ?? 'usdc'}`);
    try {
      const result = await fundWalletFiat({ address, amount, chain, token, open: true });
      log(`circle_fund_fiat ← ${preview(result.url, 80)}`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_fund_fiat ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const fetchServiceTool = tool({
  name: 'fetch_service',
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
      return JSON.stringify(result);
    } catch (e) {
      log(`fetch_service ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleSearchServices = tool({
  name: 'circle_search_services',
  description: TOOL_DESCRIPTIONS.circle_search_services,
  parameters: z.object({
    keyword: z.string().describe('Search keyword, e.g. "weather", "image", "geocode".'),
  }),
  execute: async ({ keyword }) => {
    log(`circle_search_services keyword="${keyword}"`);
    try {
      const result = await searchServices({ keyword });
      log(`circle_search_services ← ${(result as unknown[]).length} hit(s)`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_search_services ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleInspectService = tool({
  name: 'circle_inspect_service',
  description: TOOL_DESCRIPTIONS.circle_inspect_service,
  parameters: z.object({
    url: z.string().describe('The service URL returned by circle_search_services.'),
  }),
  execute: async ({ url }) => {
    log(`circle_inspect_service url=${url}`);
    try {
      const result = await inspectService({ url });
      log(`circle_inspect_service ← ${preview(JSON.stringify(result))}`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_inspect_service ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleGetGatewayBalance = tool({
  name: 'circle_get_gateway_balance',
  description: TOOL_DESCRIPTIONS.circle_get_gateway_balance,
  parameters: z.object({
    address: z.string().describe('EVM wallet address (0x...).'),
    chain: chainEnum.optional().describe('Chain to read the Gateway balance on. Defaults to BASE.'),
  }),
  execute: async ({ address, chain }) => {
    log(`circle_get_gateway_balance address=${address} chain=${chain ?? 'BASE'}`);
    try {
      const result = await gatewayBalance({ address, chain: chain as Chain | undefined });
      log(`circle_get_gateway_balance ← total=${result.total} USDC`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_get_gateway_balance ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circlePayService = tool({
  name: 'circle_pay_service',
  description: TOOL_DESCRIPTIONS.circle_pay_service('dataJson'),
  needsApproval: true,
  parameters: z.object({
    url: z.string().describe('The service URL to pay'),
    address: z.string().describe('The wallet address to pay from'),
    method: z
      .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
      .optional()
      .describe(
        "HTTP method the service expects, copied from circle_inspect_service's `method` " +
          'field. Defaults to GET if omitted.',
      ),
    // A JSON string, not an object: @openai/agents runs tools in strict mode,
    // which forces every object schema to additionalProperties:false. An open
    // payload object would collapse to a closed empty object the model can never
    // fill, so it would always send {} and the server would reject the paid call.
    dataJson: z
      .string()
      .describe(
        'JSON-encoded payload object matching the service input schema, e.g. \'{"city":"NYC"}\'. ' +
          'For a GET service these become query parameters (arrays repeat the key, e.g. ' +
          'symbols=ETH&symbols=BTC); for POST/PUT/PATCH they become the JSON request body.',
      ),
  }),
  execute: async ({ url, address, method, dataJson }) => {
    const httpMethod = (method ?? 'GET').toUpperCase();
    log(`circle_pay_service url=${url} from=${address} method=${httpMethod} data=${preview(dataJson, 80)}`);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataJson) as Record<string, unknown>;
    } catch (e) {
      log(`circle_pay_service ✗ invalid dataJson`);
      throw new Error(
        `dataJson is not valid JSON: ${(e as Error).message}. Re-check the service schema from circle_inspect_service.`,
      );
    }

    const picked = await selectPayChain(url, httpMethod, log);
    if (!picked.ok) throw new Error(picked.message);
    const chain = picked.chain;

    const deployed = await ensureDeployed(address, chain, log);
    if (!deployed.ok) throw new Error(deployed.message);

    try {
      const result = await payService({ url, address, data: data as Record<string, unknown>, method: httpMethod, chain });
      const tx = (result as { txHash?: string }).txHash
        ? ` txHash=${(result as { txHash?: string }).txHash}`
        : '';
      log(`circle_pay_service ← paid on ${chainLabel(chain)}${tx}`);
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_pay_service ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export const circleGatewayDeposit = tool({
  name: 'circle_gateway_deposit',
  description: TOOL_DESCRIPTIONS.circle_gateway_deposit,
  needsApproval: true,
  parameters: z.object({
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
  execute: async ({ url, address, method, amount }) => {
    const httpMethod = (method ?? 'GET').toUpperCase();
    log(`circle_gateway_deposit url=${url} address=${address} amount=${amount}`);

    const picked = await selectGatewayChain(url, httpMethod, log);
    if (!picked.ok) throw new Error(picked.message);
    const chain = picked.chain;

    const depositMethod = selectDepositMethod(chain);
    try {
      const result = await gatewayDeposit({ address, amount, chain, method: depositMethod });
      log(
        `circle_gateway_deposit ← ${result.amount} USDC on ${chainLabel(chain)} via ${depositMethod} tx=${result.txId ?? 'n/a'}`,
      );
      return JSON.stringify(result);
    } catch (e) {
      log(`circle_gateway_deposit ✗ ${(e as Error).message}`);
      throw e;
    }
  },
});

export function buildAuthTools(ask: (q: string) => Promise<string>) {
  const loginTool = tool({
    name: 'circle_login',
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
        return JSON.stringify({ status: result.status, message });
      } catch (e) {
        log(`circle_login ✗ ${(e as Error).message}`);
        throw e;
      }
    },
  });

  const logoutTool = tool({
    name: 'circle_logout',
    description: TOOL_DESCRIPTIONS.circle_logout,
    parameters: z.object({}),
    execute: async () => {
      log('circle_logout');
      try {
        logout(log);
        return JSON.stringify({ message: 'Logged out; Circle credentials cleared.' });
      } catch (e) {
        log(`circle_logout ✗ ${(e as Error).message}`);
        throw e;
      }
    },
  });

  return { loginTool, logoutTool };
}
