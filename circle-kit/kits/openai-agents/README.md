# OpenAI Agents SDK × Circle Agent Stack

## What it is

An Autonomous Payment Agent built with the [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/guides/agents/). From a single TypeScript entry point, the agent bootstraps via the Circle Agent Skill, creates an agent wallet on BASE, checks balances, discovers an x402-compatible service on the Circle Agent Marketplace, and pays for it using a USDC nanopayment.

This is the sibling of the [LangChain Deep Agents kit](../langchain) and the [Claude Agent SDK kit](../claude-agent-sdk): same Autonomous Payment Agent scenario, same shared [`circle-tools`](../../packages/circle-tools) package, so you can compare how each framework approaches the same problem.

## Prerequisites

- [Bun](https://bun.com) 1.2+
- An `OPENAI_API_KEY`. The OpenAI Agents SDK only supports OpenAI-compatible
  models; for Anthropic models use the [langchain](../langchain) or
  [claude-agent-sdk](../claude-agent-sdk) kit.

## Quickstart

```bash
git clone <repo-url> && cd agent-stack-ecosystem-kits
bun install
cp kits/openai-agents/.env.example kits/openai-agents/.env   # then fill in keys
bun run --cwd kits/openai-agents demo
```

> Run the demo with `--cwd`, not `bun --filter`. `--filter` wraps output in a
> dashboard that elides lines and interferes with the interactive prompt;
> `--cwd` runs the script directly with plain, full output.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | The OpenAI Agents SDK only supports OpenAI-compatible models; the run errors at startup if it is unset. |
| `LLM_MODEL` | no | Overrides the default model (`gpt-5.4`). Any OpenAI model id works, e.g. `gpt-4o`, `gpt-4o-mini`. |
| `NO_COLOR` | no | Set to disable colored output. Color is auto-disabled when output is piped or redirected. |

The kit pays on Base by default and falls back to Polygon when a service offers no Base payment option. The chain is selected automatically per service, so there is nothing to configure.

## Links

- OpenAI Agents SDK: [docs](https://openai.github.io/openai-agents-js/guides/agents/), [GitHub](https://github.com/openai/openai-agents-js)
- [Circle Agent Stack](https://developers.circle.com/agent-stack)
- [Circle Agent Marketplace](https://agents.circle.com/services)
