import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsResolverService } from './permissions.service';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController, RolesController],
  providers: [AuthService, JwtStrategy, PermissionsResolverService, RolesService],
  exports: [AuthService, PermissionsResolverService, RolesService],
})
export class AuthModule {}
