# Mastra × Circle Agent Stack

## What it is

An Autonomous Payment Agent built with [Mastra](https://mastra.ai). From a single TypeScript entry point, the agent bootstraps via the Circle Agent Skill, creates an agent wallet on BASE, checks balances, discovers an x402-compatible service on the Circle Agent Marketplace, and pays for it using a USDC nanopayment.

This is the sibling of the [LangChain Deep Agents kit](../langchain) and the [Claude Agent SDK kit](../claude-agent-sdk): same Autonomous Payment Agent scenario, same shared [`circle-tools`](../../packages/circle-tools) package, so you can compare how each framework approaches the same problem.

## Prerequisites

- [Bun](https://bun.com) 1.2+
- An LLM provider API key (Anthropic or OpenAI)

## Quickstart

```bash
git clone <repo-url> && cd agent-stack-ecosystem-kits
bun install
cp kits/mastra/.env.example kits/mastra/.env   # then fill in keys
bun run --cwd kits/mastra demo
```

> Run the demo with `--cwd`, not `bun --filter`. `--filter` wraps output in a
> dashboard that elides lines and interferes with the interactive prompt;
> `--cwd` runs the script directly with plain, full output.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` | one of | Provider auto-selected from whichever key is set. Anthropic wins if both are set. |
| `LLM_MODEL` | no | Overrides the default model (`anthropic/claude-sonnet-4-6` / `openai/gpt-5.4`). Include the provider prefix, the form Mastra expects. |
| `NO_COLOR` | no | Set to disable colored output. Color is auto-disabled when output is piped or redirected. |

The kit pays on Base by default and falls back to Polygon when a service offers no Base payment option. The chain is selected automatically per service, so there is nothing to configure.

## Links

- Mastra: [docs](https://mastra.ai/docs/agents/overview), [GitHub](https://github.com/mastra-ai/mastra)
- [Circle Agent Stack](https://developers.circle.com/agent-stack)
- [Circle Agent Marketplace](https://agents.circle.com/services)
