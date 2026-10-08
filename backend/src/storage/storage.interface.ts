export interface StoredFile {
  storageKey: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimeType?: string): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  resolvePath(storageKey: string): string;
}
