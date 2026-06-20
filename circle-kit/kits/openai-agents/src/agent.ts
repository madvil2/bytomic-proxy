import { Agent } from '@openai/agents';
import type { KitConfig } from './config';
import {
  fetchSetupSkillTool,
  fetchSubSkillTool,
  circleCreateWallet,
  circleListWallets,
  circleGetBalance,
  fetchServiceTool,
  circleDeployWallet,
  fundFiatTool,
  circleGetGatewayBalance,
  circleSearchServices,
  circleInspectService,
  circlePayService,
  circleGatewayDeposit,
  buildAuthTools,
} from './tools';

export function buildAgent(config: KitConfig, ask: (q: string) => Promise<string>): Agent {
  const { loginTool, logoutTool } = buildAuthTools(ask);
  // No hand-written system prompt: like the langchain, claude-agent-sdk, and
  // google-adk kits, the bootstrap prompt plus setup.md drive the flow. The
  // agent sets up the wallet and then waits for the user to ask for a service,
  // instead of scripting a discover-then-pay sequence on its own.
  return new Agent({
    name: 'Circle Payment Agent',
    model: config.model,
    tools: [
      loginTool,
      logoutTool,
      fetchSetupSkillTool,
      fetchSubSkillTool,
      circleCreateWallet,
      circleListWallets,
      circleGetBalance,
      fetchServiceTool,
      circleDeployWallet,
      fundFiatTool,
      circleGetGatewayBalance,
      circleSearchServices,
      circleInspectService,
      circlePayService,
      circleGatewayDeposit,
    ],
  });
}
