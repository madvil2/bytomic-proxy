import 'dotenv/config';

export type LLMProvider = 'anthropic' | 'openai';

export interface KitConfig {
  provider: LLMProvider;
  /** Full Mastra model string, e.g. "anthropic/claude-sonnet-4-6" or "openai/gpt-5.4". */
  model: string;
}

const DEFAULT_ANTHROPIC_MODEL = 'anthropic/claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL = 'openai/gpt-5.4';

/**
 * Load kit configuration from environment variables.
 *
 * Provider selection: whichever API key is set wins. ANTHROPIC_API_KEY is
 * checked first; if absent, OPENAI_API_KEY is used. Set LLM_MODEL to override
 * the default model (include the provider prefix, e.g. "anthropic/claude-opus-4-7").
 *
 * The chain is selected automatically per service at payment time (Base
 * preferred, Polygon fallback), so there is no chain to configure here.
 */
export function loadConfig(): KitConfig {
  const env = process.env;

  if (env.ANTHROPIC_API_KEY?.trim()) {
    return {
      provider: 'anthropic',
      model: env.LLM_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  if (env.OPENAI_API_KEY?.trim()) {
    return {
      provider: 'openai',
      model: env.LLM_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    };
  }

  throw new Error(
    'No LLM provider key found. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in kits/mastra/.env.',
  );
}
