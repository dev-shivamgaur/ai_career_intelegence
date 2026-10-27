import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import { llmProvider } from './ai-runtime';
import { withTimeout } from '../rag/qdrant-client';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Default wall-clock budget for a single LLM round-trip (env: LLM_TIMEOUT_MS). */
export const DEFAULT_LLM_TIMEOUT_MS = 60_000;
/** Structured JSON / tool-shaped outputs often need longer than plain text. */
export const DEFAULT_LLM_STRUCTURED_TIMEOUT_MS = 90_000;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  provider() {
    return llmProvider(this.config);
  }

  isConfigured(): boolean {
    return this.provider() === 'google' ? Boolean(this.googleKey()) : Boolean(this.openaiKey());
  }

  /** Plain-text completion budget. Override with opts.timeoutMs or LLM_TIMEOUT_MS. */
  defaultTimeoutMs() {
    const raw = Number(this.config.get<string>('LLM_TIMEOUT_MS') ?? '');
    return Number.isFinite(raw) && raw >= 5_000 ? Math.floor(raw) : DEFAULT_LLM_TIMEOUT_MS;
  }

  /** Structured-output budget. Override with LLM_STRUCTURED_TIMEOUT_MS. */
  structuredTimeoutMs() {
    const raw = Number(this.config.get<string>('LLM_STRUCTURED_TIMEOUT_MS') ?? '');
    return Number.isFinite(raw) && raw >= 5_000 ? Math.floor(raw) : DEFAULT_LLM_STRUCTURED_TIMEOUT_MS;
  }

  chat(opts?: { temperature?: number; model?: string }): ChatOpenAI | ChatGoogleGenerativeAI {
    const temperature = opts?.temperature ?? 0.2;
    const maxRetries = 2;
    if (this.provider() === 'google') {
      const model =
        opts?.model ?? this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
      this.logger.debug(`LLM provider=google model=${model}`);
      return new ChatGoogleGenerativeAI({
        apiKey: this.requireGoogleKey(),
        model,
        temperature,
        maxRetries,
      });
    }

    const model =
      opts?.model ??
      this.config.get<string>('OPENAI_LLM_MODEL') ??
      'gpt-4o-mini';
    const baseURL = this.config.get<string>('OPENAI_BASE_URL', '').trim() || undefined;
    this.logger.debug(`LLM provider=openai model=${model}`);
    return new ChatOpenAI({
      apiKey: this.requireOpenAiKey(),
      model,
      temperature,
      maxRetries,
      timeout: this.defaultTimeoutMs(),
      configuration: baseURL ? { baseURL } : undefined,
    });
  }

  async complete(
    messages: LlmMessage[],
    opts?: { temperature?: number; timeoutMs?: number; model?: string },
  ): Promise<string> {
    const mapped = messages.map((m) => {
      if (m.role === 'system') return new SystemMessage(m.content);
      return new HumanMessage(m.content);
    });
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs();
    const invoke = this.chat({ temperature: opts?.temperature, model: opts?.model }).invoke(mapped);
    const res = await withTimeout(invoke, timeoutMs, 'LLM complete');
    return messageText(res.content);
  }

  /**
   * Structured LLM call with a shared timeout. Prefer this over raw
   * chat().withStructuredOutput().invoke() so callers do not use a 20s race.
   */
  async structured<T>(
    schema: z.ZodType<T>,
    messages: BaseMessage[] | LlmMessage[],
    opts?: { temperature?: number; timeoutMs?: number; model?: string; label?: string },
  ): Promise<T> {
    const mapped = messages.map((m) => {
      if (m instanceof SystemMessage || m instanceof HumanMessage) return m;
      const row = m as LlmMessage;
      if (row.role === 'system') return new SystemMessage(row.content);
      return new HumanMessage(row.content);
    });
    const timeoutMs = opts?.timeoutMs ?? this.structuredTimeoutMs();
    const label = opts?.label ?? 'LLM structured';
    return withTimeout(
      this.chat({ temperature: opts?.temperature ?? 0, model: opts?.model })
        .withStructuredOutput(schema)
        .invoke(mapped) as Promise<T>,
      timeoutMs,
      label,
    );
  }

  private openaiKey() {
    return this.config.get<string>('OPENAI_API_KEY', '').trim();
  }

  private googleKey() {
    return this.config.get<string>('GOOGLE_API_KEY', '').trim();
  }

  private requireOpenAiKey() {
    const key = this.openaiKey();
    if (!key) {
      throw new ServiceUnavailableException({
        error: 'LLM_NOT_CONFIGURED',
        message: 'Production LLM needs OPENAI_API_KEY.',
      });
    }
    return key;
  }

  private requireGoogleKey() {
    const key = this.googleKey();
    if (!key) {
      throw new ServiceUnavailableException({
        error: 'LLM_NOT_CONFIGURED',
        message: 'Development LLM needs GOOGLE_API_KEY (Gemini).',
      });
    }
    return key;
  }
}

export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '');
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return content == null ? '' : String(content);
}
