# Claude Agent SDK × Circle Agent Stack

## What it is

An Autonomous Payment Agent built with the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). From a single TypeScript entry point, the agent bootstraps via the Circle Agent Skill, creates an agent wallet on BASE, checks balances, discovers an x402-compatible service on the Circle Agent Marketplace, and pays for it using a USDC nanopayment.

This is the sibling of the [LangChain Deep Agents kit](../langchain): same Autonomous Payment Agent scenario, same shared [`circle-tools`](../../packages/circle-tools) package, so you can compare how each framework approaches the same problem.

## Prerequisites

- [Bun](https://bun.com) 1.2+
- An `ANTHROPIC_API_KEY`. The kit is API-key only, which keeps the spawned Claude
  Code subprocess non-interactive (the subscription / OAuth path can hang it on a
  login prompt). Get a key at https://console.anthropic.com/settings/keys.

## Quickstart

```bash
git clone <repo-url> && cd agent-stack-ecosystem-kits
bun install
cp kits/claude-agent-sdk/.env.example kits/claude-agent-sdk/.env   # then fill in keys
bun run --cwd kits/claude-agent-sdk demo
```

> Run the demo with `--cwd`, not `bun --filter`. `--filter` wraps output in a
> dashboard that elides lines and interferes with the interactive prompt;
> `--cwd` runs the script directly with plain, full output.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | API-key auth for the SDK. The kit is API-key only; the run errors at startup if it is unset. Get a key at https://console.anthropic.com/settings/keys. |
| `LLM_MODEL` | no | Overrides the default model (`claude-sonnet-4-6`). |
| `NO_COLOR` | no | Set to disable colored output. Color is auto-disabled when output is piped or redirected. |

The kit pays on Base by default and falls back to Polygon when a service offers no Base payment option. The chain is selected automatically per service, so there is nothing to configure.

## Links

- Claude Agent SDK: [docs](https://code.claude.com/docs/en/agent-sdk/overview), [TypeScript SDK](https://github.com/anthropics/claude-agent-sdk-typescript), [demos](https://github.com/anthropics/claude-agent-sdk-demos)
- [Circle Agent Stack](https://developers.circle.com/agent-stack)
- [Circle Agent Marketplace](https://agents.circle.com/services)
