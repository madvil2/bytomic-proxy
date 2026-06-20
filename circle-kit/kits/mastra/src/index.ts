import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { ensureSession } from '@agent-stack-ecosystem-kits/circle-tools';
import { buildAgent } from './agent';
import { loadConfig } from './config';
import { withRetry } from './retry';
import { BOOTSTRAP_PROMPT } from '@agent-stack-ecosystem-kits/kit-core/tools';
import { bold, dim, kitLine, red, yellow } from './theme';

function log(line: string): void {
  console.log(kitLine(line));
}

type ChatMessage = { role: 'user'; content: string } | { role: 'assistant'; content: string };

// Open readline only for the duration of a single question so it never owns the
// TTY while the agent streams. `exit` typed at ANY prompt (chat input or an
// approval [y/N]) halts the demo immediately, before the answer reaches the caller.
async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    if (answer.trim().toLowerCase() === 'exit') {
      log('exit, halting.');
      process.exit(0);
    }
    return answer;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  log('Autonomous Payment Agent demo starting');
  const config = loadConfig();
  log(`chain=BASE provider=${config.provider} model=${config.model}`);
  log(dim('tip: type "exit" at any prompt to quit'));

  // Inline auth: ensure a valid Circle CLI session before the agent runs. Logs
  // in with email + OTP if needed; a pending Terms gate is reported as a manual
  // step (the kit never accepts the Terms of Use on the user's behalf).
  await ensureSession({ ask, log, bold });

  // setup.md drives the first turn; there is no hand-written bootstrap flow.
  const bootstrapPrompt = BOOTSTRAP_PROMPT;

  // Built after `ask` exists: the agent's two spend tools pause for human
  // approval through it, and circle_login prompts for email + OTP through it.
  const agent = buildAgent(config, ask);

  // Interactive chat loop. The first turn runs the bootstrap prompt; after the
  // agent settles, the user drives follow-up turns. The full message history is
  // passed back on each turn, so the agent keeps context. Empty input or
  // `exit` / `quit` ends the session.
  log('invoking agent ...');
  const messages: ChatMessage[] = [{ role: 'user', content: bootstrapPrompt }];

  while (true) {
    const response = await withRetry(() => agent.generate(messages, { maxSteps: 30 }), 'agent');
    const text = response.text ?? '(no output)';
    console.log('\n' + text + '\n');
    messages.push({ role: 'assistant', content: text });

    const input = (await ask(`\n${bold('You:')}\n> `)).trim();
    if (!input || input.toLowerCase() === 'quit') {
      log('done.');
      break;
    }
    messages.push({ role: 'user', content: input });
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // A 529 means the LLM provider is overloaded after exhausting retries: it is
  // transient and not a kit bug, so say so plainly instead of dumping raw JSON.
  const overloaded = (err as { status?: number })?.status === 529 || message.includes('529');
  if (overloaded) {
    console.error(
      kitLine(red('FATAL: the LLM provider is overloaded (HTTP 529) and retries were exhausted.')),
    );
    console.error(kitLine(yellow('This is transient on the provider side. Re-run in a moment.')));
  } else {
    console.error(kitLine(red(`FATAL: ${message}`)));
  }
  process.exit(1);
});
