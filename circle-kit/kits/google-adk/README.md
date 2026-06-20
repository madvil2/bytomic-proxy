# Google ADK × Circle Agent Stack

## What it is

An Autonomous Payment Agent built with the [Google Agent Development Kit (ADK)](https://adk.dev/get-started/typescript/). From a single TypeScript entry point, the agent bootstraps via the Circle Agent Skill, creates an agent wallet on BASE, checks balances, discovers an x402-compatible service on the Circle Agent Marketplace, and pays for it using a USDC nanopayment.

This is the sibling of the [LangChain Deep Agents kit](../langchain) and the [Claude Agent SDK kit](../claude-agent-sdk): same Autonomous Payment Agent scenario, same shared [`circle-tools`](../../packages/circle-tools) package, so you can compare how each framework approaches the same problem.

## Prerequisites

- [Bun](https://bun.com) 1.2+
- A Google AI Studio API key (`GOOGLE_API_KEY`). Get one at https://aistudio.google.com/apikey.

## Quickstart

```bash
git clone <repo-url> && cd agent-stack-ecosystem-kits
bun install
cp kits/google-adk/.env.example kits/google-adk/.env   # then fill in keys
bun run --cwd kits/google-adk demo
```

> Run the demo with `--cwd`, not `bun --filter`. `--filter` wraps output in a
> dashboard that elides lines and interferes with the interactive prompt;
> `--cwd` runs the script directly with plain, full output.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `GOOGLE_API_KEY` | yes | Google AI Studio API key. The Gemini model is constructed with this key explicitly. Get one at https://aistudio.google.com/apikey. |
| `LLM_MODEL` | no | Overrides the default model (`gemini-3-flash-preview`). Any Gemini model id supported by `@google/genai` works. |
| `NO_COLOR` | no | Set to disable colored output. Color is auto-disabled when output is piped or redirected. |

The kit pays on Base by default and falls back to Polygon when a service offers no Base payment option. The chain is selected automatically per service, so there is nothing to configure.

## Links

- Google ADK: [docs](https://adk.dev/get-started/typescript/), [adk-js on GitHub](https://github.com/google/adk-js), [samples](https://github.com/google/adk-samples)
- [Circle Agent Stack](https://developers.circle.com/agent-stack)
- [Circle Agent Marketplace](https://agents.circle.com/services)
