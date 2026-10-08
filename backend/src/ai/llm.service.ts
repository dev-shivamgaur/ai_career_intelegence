import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { llmProvider } from './ai-runtime';
import { withTimeout } from '../rag/qdrant-client';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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

  chat(opts?: { temperature?: number; model?: string }): ChatOpenAI | ChatGoogleGenerativeAI {
    const temperature = opts?.temperature ?? 0.2;
    if (this.provider() === 'google') {
      const model =
        opts?.model ?? this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
      this.logger.debug(`LLM provider=google model=${model}`);
      return new ChatGoogleGenerativeAI({
        apiKey: this.requireGoogleKey(),
        model,
        temperature,
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
    const timeoutMs = opts?.timeoutMs ?? 28_000;
    const invoke = this.chat({ temperature: opts?.temperature, model: opts?.model }).invoke(mapped);
    const res = await withTimeout(invoke, timeoutMs, 'LLM complete');
    return messageText(res.content);
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
