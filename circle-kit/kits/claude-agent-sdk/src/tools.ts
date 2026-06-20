import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import * as circle from '@agent-stack-ecosystem-kits/circle-tools';
import { z } from 'zod';

import {
  fetchSetupSkill,
  fetchSubSkill,
  SETUP_SKILL_URL,
  SUB_SKILL_NAMES,
  type SubSkillName,
} from '@agent-stack-ecosystem-kits/kit-core/skill';
import {
  TOOL_DESCRIPTIONS,
  SPEND_TOOL_NAMES,
  preview,
  selectPayChain,
  selectGatewayChain,
  ensureDeployed,
  selectDepositMethod,
} from '@agent-stack-ecosystem-kits/kit-core/tools';
import { bold, toolLine } from './theme';

/**
 * The Circle tools run as an in-process MCP server (`createSdkMcpServer`), the
 * Claude Agent SDK's native way to expose custom tools. Each tool is named
 * `<TOOL>` here but the SDK addresses it as `mcp__circle__<TOOL>` once the
 * server is mounted under MCP_SERVER_NAME, so the entry point and `canUseTool`
 * use the fully-qualified names below.
 */
export const MCP_SERVER_NAME = 'circle';

/** Fully-qualified MCP name for a tool on this server. */
function fq(name: string): string {
  return `mcp__${MCP_SERVER_NAME}__${name}`;
}

/**
 * The two tools that move USDC. The entry point routes these through human
 * approval in `canUseTool`; every other tool runs without a pause. Listed by
 * fully-qualified name to match what the SDK passes to `canUseTool`.
 */
export const SPEND_TOOLS = SPEND_TOOL_NAMES.map(fq) as readonly string[];

/** A tool result is plain text the model reads back: JSON for our tools. */
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function log(line: string): void {
  console.log(toolLine(line));
}

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function err(e: unknown): ToolResult {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

const subSkillEnum = z.enum(SUB_SKILL_NAMES as [SubSkillName, ...SubSkillName[]]);
const chainEnum = z.enum(['BASE', 'POLYGON']);

const fetchSetupSkillTool = tool(
  'fetch_setup_skill',
  TOOL_DESCRIPTIONS.fetch_setup_skill,
  {},
  async (): Promise<ToolResult> => {
    log(`fetch_setup_skill → ${SETUP_SKILL_URL}`);
    try {
      const body = await fetchSetupSkill();
      log(`fetch_setup_skill ← ${body.length} bytes`);
      return { content: [{ type: 'text', text: body }] };
    } catch (e) {
      log(`fetch_setup_skill ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const fetchSubSkillTool = tool(
  'fetch_sub_skill',
  TOOL_DESCRIPTIONS.fetch_sub_skill,
  { name: subSkillEnum.describe('Sub-skill name, without the .md extension.') },
  async ({ name }): Promise<ToolResult> => {
    log(`fetch_sub_skill name=${name}`);
    try {
      const body = await fetchSubSkill(name);
      log(`fetch_sub_skill ← ${body.length} bytes`);
      return { content: [{ type: 'text', text: body }] };
    } catch (e) {
      log(`fetch_sub_skill ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const listAgentWallets = tool(
  'circle_list_wallets',
  TOOL_DESCRIPTIONS.circle_list_wallets,
  {},
  async (): Promise<ToolResult> => {
    log(`circle_list_wallets`);
    try {
      const result = await circle.listWallets();
      log(`circle_list_wallets ← ${result.length} wallet(s)`);
      return ok(result);
    } catch (e) {
      log(`circle_list_wallets ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const createAgentWallet = tool(
  'circle_create_wallet',
  TOOL_DESCRIPTIONS.circle_create_wallet,
  {},
  async (): Promise<ToolResult> => {
    log(`circle_create_wallet`);
    try {
      const result = await circle.createWallet();
      log(`circle_create_wallet ← ${result.address}`);
      return ok(result);
    } catch (e) {
      log(`circle_create_wallet ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const getWalletBalance = tool(
  'circle_get_balance',
  TOOL_DESCRIPTIONS.circle_get_balance,
  {
    address: z.string().describe('EVM wallet address (0x...).'),
    chain: chainEnum.optional().describe('Chain to read the balance on. Defaults to BASE.'),
  },
  async ({ address, chain }): Promise<ToolResult> => {
    log(`circle_get_balance address=${address} chain=${chain ?? 'BASE'}`);
    try {
      const result = await circle.getBalance({ address, chain });
      const usdc = result.tokens.find((t) => t.symbol?.toUpperCase() === 'USDC');
      log(`circle_get_balance ← USDC=${usdc?.amount ?? '0'} (${result.tokens.length} token(s))`);
      return ok(result);
    } catch (e) {
      log(`circle_get_balance ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const deployWalletTool = tool(
  'circle_deploy_wallet',
  TOOL_DESCRIPTIONS.circle_deploy_wallet,
  {
    address: z.string().describe('Agent wallet address to deploy (0x...).'),
    chain: chainEnum.optional().describe('Chain to deploy the SCA on. Defaults to BASE.'),
  },
  async ({ address, chain }): Promise<ToolResult> => {
    log(`circle_deploy_wallet address=${address} chain=${chain ?? 'BASE'}`);
    try {
      const result = await circle.deployWallet({ address, chain });
      if (result.alreadyDeployed) {
        log(`circle_deploy_wallet ← already deployed`);
      } else if (result.deployed) {
        log(`circle_deploy_wallet ← deployed tx=${result.txId ?? 'n/a'}`);
      } else {
        log(
          `circle_deploy_wallet ← submitted, on-chain confirmation pending tx=${result.txId ?? 'n/a'}`,
        );
      }
      return ok(result);
    } catch (e) {
      log(`circle_deploy_wallet ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const fundFiatTool = tool(
  'circle_fund_fiat',
  TOOL_DESCRIPTIONS.circle_fund_fiat,
  {
    address: z.string().describe('Destination agent wallet address (0x...).'),
    amount: z.number().positive().describe('Amount of token to buy, in human units (e.g. 10 for $10 of USDC).'),
    chain: chainEnum.optional().describe('Chain the funds deposit on. Defaults to BASE.'),
    token: z
      .enum(['usdc', 'eurc', 'eth', 'native'])
      .optional()
      .describe('Token to buy. Defaults to usdc.'),
  },
  async ({ address, amount, chain, token }): Promise<ToolResult> => {
    log(`circle_fund_fiat address=${address} amount=${amount} chain=${chain ?? 'BASE'} token=${token ?? 'usdc'}`);
    try {
      // Local interactive demo: open the Transak page in the user's browser so
      // they can complete the purchase. Best-effort and a no-op on headless.
      const result = await circle.fundWalletFiat({ address, amount, chain, token, open: true });
      log(`circle_fund_fiat ← ${preview(result.url, 80)}`);
      return ok(result);
    } catch (e) {
      log(`circle_fund_fiat ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const searchServices = tool(
  'circle_search_services',
  TOOL_DESCRIPTIONS.circle_search_services,
  { keyword: z.string().describe('Search keyword, e.g. "weather", "image", "geocode".') },
  async ({ keyword }): Promise<ToolResult> => {
    log(`circle_search_services keyword="${keyword}"`);
    try {
      const result = await circle.searchServices({ keyword });
      log(`circle_search_services ← ${result.length} hit(s)`);
      return ok(result);
    } catch (e) {
      log(`circle_search_services ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const inspectService = tool(
  'circle_inspect_service',
  TOOL_DESCRIPTIONS.circle_inspect_service,
  { url: z.string().describe('The service URL returned by circle_search_services.') },
  async ({ url }): Promise<ToolResult> => {
    log(`circle_inspect_service url=${url}`);
    try {
      const result = await circle.inspectService({ url });
      log(`circle_inspect_service ← ${preview(JSON.stringify(result))}`);
      return ok(result);
    } catch (e) {
      log(`circle_inspect_service ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const fetchServiceTool = tool(
  'fetch_service',
  TOOL_DESCRIPTIONS.fetch_service,
  { url: z.string().describe('The service endpoint URL to GET.') },
  async ({ url }): Promise<ToolResult> => {
    log(`fetch_service url=${url}`);
    try {
      const result = await circle.fetchService({ url });
      if (result.paymentRequired) {
        log(`fetch_service ← HTTP 402, payment required`);
      } else {
        log(`fetch_service ← HTTP ${result.status} ${result.body.length} bytes`);
      }
      return ok(result);
    } catch (e) {
      log(`fetch_service ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const payService = tool(
  'circle_pay_service',
  TOOL_DESCRIPTIONS.circle_pay_service('dataJson'),
  {
    url: z.string().describe('Service URL.'),
    address: z.string().describe('Paying agent wallet address (0x...).'),
    method: z
      .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
      .optional()
      .describe(
        "HTTP method the service expects, copied from circle_inspect_service's `method` " +
          'field. Defaults to GET if omitted.',
      ),
    dataJson: z
      .string()
      .describe(
        'JSON-encoded payload object matching the service input schema, e.g. \'{"city":"NYC"}\'. ' +
          'For a GET service these become query parameters (arrays repeat the key, e.g. ' +
          'symbols=ETH&symbols=BTC); for POST/PUT/PATCH they become the JSON request body.',
      ),
  },
  async ({ url, address, dataJson, method }): Promise<ToolResult> => {
    const httpMethod = (method ?? 'GET').toUpperCase();
    log(
      `circle_pay_service url=${url} from=${address} method=${httpMethod} data=${preview(dataJson, 80)}`,
    );
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataJson) as Record<string, unknown>;
    } catch (e) {
      log(`circle_pay_service ✗ invalid dataJson`);
      return err(
        new Error(
          `dataJson is not valid JSON: ${(e as Error).message}. Re-check the service schema from circle_inspect_service.`,
        ),
      );
    }

    const picked = await selectPayChain(url, httpMethod, log);
    if (!picked.ok) return err(new Error(picked.message));
    const chain = picked.chain;

    const deployed = await ensureDeployed(address, chain, log);
    if (!deployed.ok) return err(new Error(deployed.message));

    try {
      const result = await circle.payService({ url, address, data, method: httpMethod, chain });
      const tx = result.txHash ? ` txHash=${result.txHash}` : '';
      log(`circle_pay_service ← paid on ${circle.chainLabel(chain)}${tx} ${result.response.length} bytes`);
      return ok(result);
    } catch (e) {
      log(`circle_pay_service ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const getGatewayBalance = tool(
  'circle_get_gateway_balance',
  TOOL_DESCRIPTIONS.circle_get_gateway_balance,
  {
    address: z.string().describe('EVM wallet address (0x...).'),
    chain: chainEnum.optional().describe('Chain to read the Gateway balance on. Defaults to BASE.'),
  },
  async ({ address, chain }): Promise<ToolResult> => {
    log(`circle_get_gateway_balance address=${address} chain=${chain ?? 'BASE'}`);
    try {
      const result = await circle.gatewayBalance({ address, chain });
      log(`circle_get_gateway_balance ← total=${result.total} USDC`);
      return ok(result);
    } catch (e) {
      log(`circle_get_gateway_balance ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const gatewayDepositTool = tool(
  'circle_gateway_deposit',
  TOOL_DESCRIPTIONS.circle_gateway_deposit,
  {
    url: z.string().describe('The service URL this deposit is for.'),
    address: z.string().describe('Agent wallet address to deposit from (0x...).'),
    method: z
      .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
      .optional()
      .describe(
        "HTTP method the service expects, copied from circle_inspect_service's `method` " +
          'field. Needed so the seller\'s Gateway requirement is read with the right ' +
          'method (a POST-only endpoint answers 405 to a GET probe). Defaults to GET.',
      ),
    amount: z
      .number()
      .positive()
      .describe(
        'USDC amount to move into Gateway. Size it to cover the expected paid calls ' +
          'plus the ~$0.03 fee; a Gateway minimum deposit may apply.',
      ),
  },
  async ({ url, address, amount, method }): Promise<ToolResult> => {
    const httpMethod = (method ?? 'GET').toUpperCase();
    log(`circle_gateway_deposit url=${url} address=${address} amount=${amount}`);

    const picked = await selectGatewayChain(url, httpMethod, log);
    if (!picked.ok) return err(new Error(picked.message));
    const chain = picked.chain;

    const depositMethod = selectDepositMethod(chain);
    try {
      const result = await circle.gatewayDeposit({
        address,
        amount,
        chain,
        method: depositMethod,
      });
      log(
        `circle_gateway_deposit ← ${result.amount} USDC on ${circle.chainLabel(chain)} via ${depositMethod} tx=${result.txId ?? 'n/a'}`,
      );
      return ok(result);
    } catch (e) {
      log(`circle_gateway_deposit ✗ ${(e as Error).message}`);
      return err(e);
    }
  },
);

const ALL_TOOLS = [
  fetchSetupSkillTool,
  fetchSubSkillTool,
  listAgentWallets,
  createAgentWallet,
  getWalletBalance,
  getGatewayBalance,
  deployWalletTool,
  fundFiatTool,
  searchServices,
  inspectService,
  fetchServiceTool,
  payService,
  gatewayDepositTool,
];

/**
 * The in-process MCP server exposing the Circle tools to the agent.
 *
 * The login/logout tools are built here, not at module scope, because they need
 * the demo's terminal `ask` to prompt the human for their email + OTP inline
 * (the kit never stores either). They let the agent recover an expired or
 * logged-out session mid-conversation instead of dead-ending on "run it
 * yourself" with no tool to call.
 */
export function buildCircleServer(ask: (q: string) => Promise<string>) {
  const loginTool = tool(
    'circle_login',
    TOOL_DESCRIPTIONS.circle_login,
    {},
    async (): Promise<ToolResult> => {
      log('circle_login');
      try {
        const result = await circle.ensureSession({ ask, log, bold });
        const message =
          result.status === 'already-valid'
            ? 'Already logged in; the Circle session is valid.'
            : 'Logged in. The Circle session is now valid.';
        log(`circle_login ← ${result.status}`);
        return ok({ status: result.status, message });
      } catch (e) {
        log(`circle_login ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
  );

  const logoutTool = tool(
    'circle_logout',
    TOOL_DESCRIPTIONS.circle_logout,
    {},
    async (): Promise<ToolResult> => {
      log('circle_logout');
      try {
        circle.logout(log);
        return ok({ message: 'Logged out; Circle credentials cleared.' });
      } catch (e) {
        log(`circle_logout ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
  );

  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: '0.0.0',
    tools: [...ALL_TOOLS, loginTool, logoutTool],
  });
}
