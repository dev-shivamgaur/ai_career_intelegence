import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { StorageProvider, StoredFile } from './storage.interface';

@Injectable()
export class LocalStorageService implements StorageProvider {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(
      process.cwd(),
      this.config.get<string>('UPLOAD_DIR', 'uploads'),
    );
  }

  async ensureRoot() {
    await fs.mkdir(this.root, { recursive: true });
  }

  async save(buffer: Buffer, filename: string, _mimeType?: string): Promise<StoredFile> {
    await this.ensureRoot();
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${Date.now()}-${randomUUID()}-${safe}`;
    const absolutePath = path.join(this.root, storageKey);
    await fs.writeFile(absolutePath, buffer);
    return { storageKey, absolutePath, sizeBytes: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.resolvePath(storageKey);
    await fs.unlink(absolutePath).catch(() => undefined);
  }

  resolvePath(storageKey: string): string {
    return path.join(this.root, storageKey);
  }
}
