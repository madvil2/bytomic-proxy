# @agent-stack-ecosystem-kits/kit-core

Framework-agnostic building blocks shared across the Circle Agent Stack kits. Sits one layer above [`circle-tools`](../circle-tools) (the Circle CLI wrappers): each kit imports these pieces and adapts them to its framework's tool/agent interface, so wording, prompts, and payment safety logic stay identical across kits.

## Subpath exports

| Import | Module | Contents |
| --- | --- | --- |
| `@agent-stack-ecosystem-kits/kit-core/skill` | `src/skill.ts` | Skill markdown fetching |
| `@agent-stack-ecosystem-kits/kit-core/tools` | `src/tools.ts` | Tool descriptions, bootstrap prompt, payment preflight + approval helpers |
| `@agent-stack-ecosystem-kits/kit-core/theme` | `src/theme.ts` | Terminal color/formatting helpers |

The package root (`.`) re-exports all three.

## `skill`

Fetches the Circle Agent skill markdown that drives a kit at runtime.

- `SKILLS_BASE_URL`, `SETUP_SKILL_URL`, `SUB_SKILLS`, `SUB_SKILL_NAMES`, `SubSkillName` — skill URLs and names, single-sourced.
- `fetchSetupSkill()` — fetch `setup.md`, the markdown that drives the agent's first turn.
- `fetchSubSkill(name)` — fetch a named sub-skill (`wallet-login`, `wallet-fund`, `wallet-pay`, `discover-services`).

## `tools`

Shared, model-facing copy and the payment safety logic.

- `TOOL_DESCRIPTIONS` — the model-facing description for every tool, single-sourced so a wording change lands in every kit at once. `circle_pay_service` is a function of the payload field name (`'data'` for kits that expose an object, `'dataJson'` for kits whose SDK needs a JSON string).
- `BOOTSTRAP_PROMPT` — the first-turn prompt that tells the agent to fetch and follow `setup.md`.
- `SPEND_TOOL_NAMES`, `CHAINS`, `subSkillCatalog`, `preview()` — small shared constants/helpers.
- Payment preflight (return a chosen chain or an actionable error, never throw):
  - `selectPayChain(url, method, log)` — confirm the seller publishes a pay option on a supported chain (Base preferred, Polygon fallback) and pick it.
  - `selectGatewayChain(url, method, log)` — confirm the seller requires a Circle Gateway payment and pick the deposit chain.
  - `ensureDeployed(address, chain, log)` — confirm the wallet's SCA is deployed on the pay chain (a counterfactual wallet cannot sign x402); best-effort, a flaky RPC passes.
  - `selectDepositMethod(chain)` — Polygon → `eco` (~30s), Base → `direct` (13-19 min).
  - Types: `ChainSelection`, `PreflightCheck`.
- `approveSpend(ask, name, args, log)` — terminal human-in-the-loop gate for the two USDC-moving tools, for frameworks whose tool API has no external approval hook.

## `theme`

ANSI helpers for the kit demos' terminal output: `bold`, `dim`, `italic`, the color functions (`red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `gray`), `colorizeJson()`, `toolLine()`, `makeKitLine(label)`, and `heading()`.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
- `bun run build` — `tsc -p tsconfig.json`
- `bun run clean` — remove build output
