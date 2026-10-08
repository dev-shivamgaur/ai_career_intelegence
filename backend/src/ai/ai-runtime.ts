import { ConfigService } from '@nestjs/config';

export type LlmProvider = 'openai' | 'google';
export type EmbeddingProvider = 'openai' | 'ollama';

export function isProduction(config: ConfigService) {
  return config.get<string>('NODE_ENV', 'development') === 'production';
}

export function llmProvider(config: ConfigService): LlmProvider {
  const explicit = config.get<string>('LLM_PROVIDER', 'auto').trim().toLowerCase();
  if (explicit === 'openai' || explicit === 'google') return explicit;
  return isProduction(config) ? 'openai' : 'google';
}

export function embeddingProvider(config: ConfigService): EmbeddingProvider {
  const explicit = config.get<string>('EMBEDDING_PROVIDER', 'auto').trim().toLowerCase();
  if (explicit === 'openai' || explicit === 'ollama') return explicit;
  return isProduction(config) ? 'openai' : 'ollama';
}
