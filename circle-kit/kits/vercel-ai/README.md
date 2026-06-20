# Vercel AI SDK × Circle Agent Stack

## What it is

An Autonomous Payment Agent built with the [Vercel AI SDK](https://sdk.vercel.ai). From a single TypeScript entry point, the agent bootstraps via the Circle Agent Skill, creates an agent wallet on BASE, checks balances, discovers an x402-compatible service on the Circle Agent Marketplace, and pays for it using a USDC nanopayment.

This is the sibling of the [LangChain Deep Agents kit](../langchain) and the [Claude Agent SDK kit](../claude-agent-sdk): same Autonomous Payment Agent scenario, same shared [`circle-tools`](../../packages/circle-tools) package, so you can compare how each framework approaches the same problem.

## Prerequisites

- [Bun](https://bun.com) 1.2+
- An LLM provider API key (Anthropic or OpenAI)

## Quickstart

```bash
git clone <repo-url> && cd agent-stack-ecosystem-kits
bun install
cp kits/vercel-ai/.env.example kits/vercel-ai/.env   # then fill in keys
bun run --cwd kits/vercel-ai demo
```

> Run the demo with `--cwd`, not `bun --filter`. `--filter` wraps output in a
> dashboard that elides lines and interferes with the interactive prompt;
> `--cwd` runs the script directly with plain, full output.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` | one of | Provider auto-selected from whichever key is set. Anthropic wins if both are set; when **both** are set the other becomes an automatic fallback if the primary hits a quota or auth error. |
| `LLM_MODEL` | no | Overrides the default model (`claude-sonnet-4-6` / `gpt-5.4`). Raw model id, no provider prefix. |
| `NO_COLOR` | no | Set to disable colored output. Color is auto-disabled when output is piped or redirected. |

The kit pays on Base by default and falls back to Polygon when a service offers no Base payment option. The chain is selected automatically per service, so there is nothing to configure.

## Links

- Vercel AI SDK: [docs](https://sdk.vercel.ai), [GitHub](https://github.com/vercel/ai)
- [Circle Agent Stack](https://developers.circle.com/agent-stack)
- [Circle Agent Marketplace](https://agents.circle.com/services)
