import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './storage.service';

@Global()
@Module({
  providers: [
    LocalStorageService,
    { provide: 'STORAGE', useExisting: LocalStorageService },
  ],
  exports: [LocalStorageService, 'STORAGE'],
})
export class StorageModule {}
