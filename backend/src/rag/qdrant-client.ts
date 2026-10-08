import { QdrantClient } from '@qdrant/js-client-rest';

/** Qdrant's default request timeout is 300s, which blocks Nest from listening. */
export const QDRANT_STARTUP_TIMEOUT_MS = 5_000;

export function createAppQdrantClient(url: string, apiKey?: string) {
  return new QdrantClient({
    url,
    apiKey,
    timeout: QDRANT_STARTUP_TIMEOUT_MS,
    checkCompatibility: false,
  });
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
