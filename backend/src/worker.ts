import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Background process that consumes career ingest jobs from RabbitMQ.
 * Loads the same module graph as the API, without an HTTP server.
 * Start with: npm run start:worker
 */
async function bootstrap() {
  process.env.INGEST_WORKER = '1';
  // WORKER_QUEUES defaults to "career" (unchanged behavior); listing "market" also starts the market consumer.
  if ((process.env.WORKER_QUEUES ?? 'career').split(',').map((q) => q.trim()).includes('market')) process.env.MARKET_WORKER = '1';
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}

void bootstrap();
