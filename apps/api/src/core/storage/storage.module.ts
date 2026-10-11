import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FilesController } from './files.controller';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { StorageService } from './storage.service';
import { StorageUrlSigner } from './storage-url-signer';

@Global()
@Module({
  // JwtModule with no defaults, as EmbedsModule and FragmentsModule import it:
  // StorageUrlSigner passes the secret, lifetime and algorithm on every call.
  imports: [JwtModule.register({})],
  controllers: [FilesController],
  providers: [LocalStorageDriver, S3StorageDriver, StorageService, StorageUrlSigner],
  exports: [StorageService],
})
export class StorageModule {}
