import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { run, user } from '@openai/agents';
import type { Agent, RunResult } from '@openai/agents';
import { ensureSession } from '@agent-stack-ecosystem-kits/circle-tools';
import { BOOTSTRAP_PROMPT } from '@agent-stack-ecosystem-kits/kit-core/tools';
import { buildAgent } from './agent';
import { loadConfig } from './config';
import { withRetry } from './retry';
import { bold, colorizeJson, dim, green, kitLine, red, yellow } from './theme';

function log(line: string): void {
  console.log(kitLine(line));
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main(): Promise<void> {
  log('Autonomous Payment Agent demo starting');
  const config = loadConfig();
  log(`chain=BASE model=${config.model} auth=OPENAI_API_KEY`);
  log(dim('tip: type "exit" at any prompt to quit'));

  await ensureSession({ ask, log, bold });

  const agent = buildAgent(config, ask);
  const prompt = BOOTSTRAP_PROMPT;
  log(`prompt: ${prompt}`);
  log('running agent...');

  let result = await withRetry(() => run(agent, prompt), 'agent');
  result = await resolveInterruptions(result, agent);
  console.log(result.finalOutput ?? '(no output)');

  log('continue the conversation — type "exit" to quit');
  while (true) {
    const input = await ask(`\n${bold('You:')}\n> `);
    if (!input || input.toLowerCase() === 'exit') break;
    result = await withRetry(() => run(agent, [...result.history, user(input)]), 'agent');
    result = await resolveInterruptions(result, agent);
    console.log('\n' + (result.finalOutput ?? '(no output)') + '\n');
  }

  log('done.');
}

async function resolveInterruptions(
  result: RunResult<any, any>,
  agent: Agent<any, any>,
): Promise<RunResult<any, any>> {
  while (result.interruptions && result.interruptions.length > 0) {
    for (const interruption of result.interruptions) {
      const rawItem = interruption.rawItem as { name?: string; arguments?: string };
      const toolName = rawItem?.name ?? 'unknown';
      const toolArgs = (() => { try { return JSON.parse(rawItem?.arguments ?? '{}'); } catch { return {}; } })();

      log(yellow(`approval required for tool: ${bold(toolName)}`));
      console.log(colorizeJson(toolArgs));

      const answer = (await ask(bold('Approve this action? [y/N] '))).trim().toLowerCase();
      const approved = answer === 'y' || answer === 'yes';
      log(approved ? green('approved by user') : red('rejected by user'));
      if (approved) {
        result.state.approve(interruption);
      } else {
        result.state.reject(interruption, { message: 'User declined.' });
      }
    }
    result = await withRetry(() => run(agent, result.state), 'agent');
  }
  return result;
}

main().catch((err: unknown) => {
  console.error('[openai-agents-kit] fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
