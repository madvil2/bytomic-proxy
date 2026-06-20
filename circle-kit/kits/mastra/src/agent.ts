import { Agent } from '@mastra/core/agent';
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
  buildInteractiveTools,
} from './tools';

export function buildAgent(config: KitConfig, ask: (q: string) => Promise<string>): Agent {
  const { circlePayService, circleGatewayDeposit, loginTool, logoutTool } =
    buildInteractiveTools(ask);
  return new Agent({
    id: 'circle-payment-agent',
    name: 'Circle Payment Agent',
    // Mastra requires an `instructions` string, so unlike the kits whose
    // framework lets it be omitted entirely, this is a minimal neutral prompt.
    // It never scripts a discover-then-pay sequence: the bootstrap prompt and
    // setup.md drive the flow, and the agent waits for the user to ask for a
    // service rather than searching and paying on its own.
    instructions: [
      'You are an agent for the Circle Agent Stack.',
      'Use your tools to do what the user asks; never just describe steps.',
      'When bootstrapping, follow the fetched setup skill instructions.',
      'After each tool call, briefly explain what happened and what it means for the developer.',
    ].join(' '),
    model: config.model,
    tools: {
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
    },
  });
}
