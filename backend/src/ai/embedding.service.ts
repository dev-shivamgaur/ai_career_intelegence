import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { OllamaEmbeddings } from '@langchain/ollama';
import type { Embeddings } from '@langchain/core/embeddings';
import { embeddingProvider } from './ai-runtime';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly config: ConfigService) {}

  provider() {
    return embeddingProvider(this.config);
  }

  isConfigured(): boolean {
    if (this.provider() === 'ollama') {
      return Boolean(this.config.get<string>('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').trim());
    }
    return Boolean(this.config.get<string>('OPENAI_API_KEY', '').trim());
  }

  dimensions() {
    if (this.provider() === 'ollama') {
      return Number(this.config.get<string>('OLLAMA_EMBEDDING_DIMENSIONS') ?? '1024');
    }
    return Number(this.config.get<string>('OPENAI_EMBEDDING_DIMENSIONS') ?? '1536');
  }

  langchain(): Embeddings {
    if (this.provider() === 'ollama') {
      const model = this.config.get<string>('OLLAMA_EMBEDDING_MODEL', 'Qween3-Embedding:latest');
      const baseUrl = this.config.get<string>('OLLAMA_BASE_URL', 'http://127.0.0.1:11434');
      this.logger.log(`Embeddings provider=ollama model=${model} dim=${this.dimensions()}`);
      return new OllamaEmbeddings({ model, baseUrl });
    }

    const key = this.config.get<string>('OPENAI_API_KEY', '').trim();
    if (!key) {
      throw new ServiceUnavailableException({
        error: 'EMBEDDINGS_NOT_CONFIGURED',
        message: 'Production embeddings need OPENAI_API_KEY.',
      });
    }
    const model = this.config.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL', '').trim() || undefined;
    const dimensions = this.dimensions();
    this.logger.log(`Embeddings provider=openai model=${model} dim=${dimensions}`);
    return new OpenAIEmbeddings({
      apiKey: key,
      model,
      dimensions: model.startsWith('text-embedding-3') ? dimensions : undefined,
      configuration: baseURL ? { baseURL } : undefined,
    });
  }

  embed(text: string) {
    return this.langchain().embedQuery(text);
  }
}
