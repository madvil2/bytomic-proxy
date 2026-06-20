import { tool } from '@langchain/core/tools';
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
  preview,
  selectPayChain,
  selectGatewayChain,
  ensureDeployed,
  selectDepositMethod,
} from '@agent-stack-ecosystem-kits/kit-core/tools';
import { bold, toolLine } from './theme';

function log(line: string): void {
  console.log(toolLine(line));
}

function ok(value: unknown): string {
  return JSON.stringify(value);
}

function err(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return JSON.stringify({ error: message });
}

export function buildTools(ask: (q: string) => Promise<string>) {
  // Built here, not at module scope, because they need the demo's terminal `ask`
  // to prompt the human for their email + OTP inline (the kit never stores
  // either). They let the agent recover an expired or logged-out session
  // mid-conversation instead of dead-ending on "run it yourself".
  const loginTool = tool(
    async () => {
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
    {
      name: 'circle_login',
      description: TOOL_DESCRIPTIONS.circle_login,
      schema: z.object({}),
    },
  );

  const logoutTool = tool(
    async () => {
      log('circle_logout');
      try {
        circle.logout(log);
        return ok({ message: 'Logged out; Circle credentials cleared.' });
      } catch (e) {
        log(`circle_logout ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
    {
      name: 'circle_logout',
      description: TOOL_DESCRIPTIONS.circle_logout,
      schema: z.object({}),
    },
  );

  const fetchSetupSkillTool = tool(
    async () => {
      log(`fetch_setup_skill → ${SETUP_SKILL_URL}`);
      try {
        const body = await fetchSetupSkill();
        log(`fetch_setup_skill ← ${body.length} bytes`);
        return body;
      } catch (e) {
        log(`fetch_setup_skill ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
    {
      name: 'fetch_setup_skill',
      description: TOOL_DESCRIPTIONS.fetch_setup_skill,
      schema: z.object({}),
    },
  );

  const subSkillEnum = z.enum(SUB_SKILL_NAMES as [SubSkillName, ...SubSkillName[]]);
  const chainEnum = z.enum(['BASE', 'POLYGON']);

  const fetchSubSkillTool = tool(
    async ({ name }) => {
      log(`fetch_sub_skill name=${name}`);
      try {
        const body = await fetchSubSkill(name);
        log(`fetch_sub_skill ← ${body.length} bytes`);
        return body;
      } catch (e) {
        log(`fetch_sub_skill ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
    {
      name: 'fetch_sub_skill',
      description: TOOL_DESCRIPTIONS.fetch_sub_skill,
      schema: z.object({
        name: subSkillEnum.describe('Sub-skill name, without the .md extension.'),
      }),
    },
  );

  const listAgentWallets = tool(
    async () => {
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
    {
      name: 'circle_list_wallets',
      description: TOOL_DESCRIPTIONS.circle_list_wallets,
      schema: z.object({}),
    },
  );

  const createAgentWallet = tool(
    async () => {
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
    {
      name: 'circle_create_wallet',
      description: TOOL_DESCRIPTIONS.circle_create_wallet,
      schema: z.object({}),
    },
  );

  const getWalletBalance = tool(
    async ({ address, chain }) => {
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
    {
      name: 'circle_get_balance',
      description: TOOL_DESCRIPTIONS.circle_get_balance,
      schema: z.object({
        address: z.string().describe('EVM wallet address (0x...).'),
        chain: chainEnum.optional().describe('Chain to read the balance on. Defaults to BASE.'),
      }),
    },
  );

  const deployWalletTool = tool(
    async ({ address, chain }) => {
      log(`circle_deploy_wallet address=${address} chain=${chain ?? 'BASE'}`);
      try {
        const result = await circle.deployWallet({ address, chain });
        if (result.alreadyDeployed) {
          log(`circle_deploy_wallet ← already deployed`);
        } else if (result.deployed) {
          log(`circle_deploy_wallet ← deployed tx=${result.txId ?? 'n/a'}`);
        } else {
          log(`circle_deploy_wallet ← submitted, on-chain confirmation pending tx=${result.txId ?? 'n/a'}`);
        }
        return ok(result);
      } catch (e) {
        log(`circle_deploy_wallet ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
    {
      name: 'circle_deploy_wallet',
      description: TOOL_DESCRIPTIONS.circle_deploy_wallet,
      schema: z.object({
        address: z.string().describe('Agent wallet address to deploy (0x...).'),
        chain: chainEnum.optional().describe('Chain to deploy the SCA on. Defaults to BASE.'),
      }),
    },
  );

  const fundFiatTool = tool(
    async ({ address, amount, chain, token }) => {
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
    {
      name: 'circle_fund_fiat',
      description: TOOL_DESCRIPTIONS.circle_fund_fiat,
      schema: z.object({
        address: z.string().describe('Destination agent wallet address (0x...).'),
        amount: z.number().positive().describe('Amount of token to buy, in human units (e.g. 10 for $10 of USDC).'),
        chain: chainEnum.optional().describe('Chain the funds deposit on. Defaults to BASE.'),
        token: z
          .enum(['usdc', 'eurc', 'eth', 'native'])
          .optional()
          .describe('Token to buy. Defaults to usdc.'),
      }),
    },
  );

  const searchServices = tool(
    async ({ keyword }) => {
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
    {
      name: 'circle_search_services',
      description: TOOL_DESCRIPTIONS.circle_search_services,
      schema: z.object({
        keyword: z.string().describe('Search keyword, e.g. "weather", "image", "geocode".'),
      }),
    },
  );

  const inspectService = tool(
    async ({ url }) => {
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
    {
      name: 'circle_inspect_service',
      description: TOOL_DESCRIPTIONS.circle_inspect_service,
      schema: z.object({
        url: z.string().describe('The service URL returned by circle_search_services.'),
      }),
    },
  );

  const fetchServiceTool = tool(
    async ({ url }) => {
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
    {
      name: 'fetch_service',
      description: TOOL_DESCRIPTIONS.fetch_service,
      schema: z.object({
        url: z.string().describe('The service endpoint URL to GET.'),
      }),
    },
  );

  const payService = tool(
    async ({ url, address, dataJson, method }) => {
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
      if (!picked.ok) return err(picked.message);
      const chain = picked.chain;

      const deployed = await ensureDeployed(address, chain, log);
      if (!deployed.ok) return err(deployed.message);

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
    {
      name: 'circle_pay_service',
      description: TOOL_DESCRIPTIONS.circle_pay_service('dataJson'),
      schema: z.object({
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
      }),
    },
  );

  const getGatewayBalance = tool(
    async ({ address, chain }) => {
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
    {
      name: 'circle_get_gateway_balance',
      description: TOOL_DESCRIPTIONS.circle_get_gateway_balance,
      schema: z.object({
        address: z.string().describe('EVM wallet address (0x...).'),
        chain: chainEnum.optional().describe('Chain to read the Gateway balance on. Defaults to BASE.'),
      }),
    },
  );

  const gatewayDepositTool = tool(
    async ({ url, address, amount, method }) => {
      const httpMethod = (method ?? 'GET').toUpperCase();
      log(`circle_gateway_deposit url=${url} address=${address} amount=${amount}`);

      const picked = await selectGatewayChain(url, httpMethod, log);
      if (!picked.ok) return err(picked.message);
      const chain = picked.chain;

      const depositMethod = selectDepositMethod(chain);
      try {
        const result = await circle.gatewayDeposit({ address, amount, chain, method: depositMethod });
        log(
          `circle_gateway_deposit ← ${result.amount} USDC on ${circle.chainLabel(chain)} via ${depositMethod} tx=${result.txId ?? 'n/a'}`,
        );
        return ok(result);
      } catch (e) {
        log(`circle_gateway_deposit ✗ ${(e as Error).message}`);
        return err(e);
      }
    },
    {
      name: 'circle_gateway_deposit',
      description: TOOL_DESCRIPTIONS.circle_gateway_deposit,
      schema: z.object({
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
      }),
    },
  );

  return [
    loginTool,
    logoutTool,
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
}
