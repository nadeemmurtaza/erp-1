import { Global, Module } from '@nestjs/common';
import { CryptoMeshService } from './crypto-mesh.service';

@Global()
@Module({
  providers: [CryptoMeshService],
  exports: [CryptoMeshService],
})
export class CryptoModule {}
