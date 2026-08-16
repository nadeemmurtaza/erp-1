import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [FilesController],
  providers: [LocalStorageDriver, S3StorageDriver, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
