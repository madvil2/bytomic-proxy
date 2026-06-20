import 'dotenv/config';

export interface KitConfig {
  openaiApiKey: string;
  /** OpenAI model name. Override via LLM_MODEL env var. */
  model: string;
}

const DEFAULT_MODEL = 'gpt-5.4';

/**
 * Load kit configuration from environment variables.
 *
 * This kit uses the OpenAI Agents SDK, which only supports OpenAI-compatible
 * models. Set LLM_MODEL to switch between models (e.g. "gpt-4o", "gpt-4o-mini").
 * For a multi-provider kit, see the langchain or claude-agent-sdk kits instead.
 *
 * The chain is selected automatically per service at payment time (Base
 * preferred, Polygon fallback), so there is no chain to configure here.
 */
export function loadConfig(): KitConfig {
  const env = process.env;
  const openaiApiKey = env.OPENAI_API_KEY?.trim();

  if (!openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is required. Set it in kits/openai-agents/.env.\n' +
        'This kit uses the OpenAI Agents SDK and only supports OpenAI-compatible models.\n' +
        'For Anthropic model support, use the langchain or claude-agent-sdk kit instead.',
    );
  }

  return {
    openaiApiKey,
    model: env.LLM_MODEL?.trim() || DEFAULT_MODEL,
  };
}
