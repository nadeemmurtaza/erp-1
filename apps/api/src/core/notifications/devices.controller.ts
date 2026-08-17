import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

const PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;

export class RegisterDeviceDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  @ApiPropertyOptional({ enum: PLATFORMS })
  @IsOptional()
  @IsIn([...PLATFORMS])
  platform?: (typeof PLATFORMS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @ApiPropertyOptional({ example: 'ur' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}

/**
 * Where the mobile app tells us how to reach it.
 *
 * Registering is an upsert on the token, so reopening the app is free and a
 * handset that changes hands moves to its new owner rather than being
 * registered twice.
 */
@ApiTags('devices')
@Controller('me/devices')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: 'Register this installation for push notifications' })
  async register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    const device = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId: user.id,
        platform: dto.platform ?? 'ANDROID',
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        lastSeenAt: new Date(),
      },
      create: {
        userId: user.id,
        token: dto.token,
        platform: dto.platform ?? 'ANDROID',
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
      },
      select: { id: true, platform: true, lastSeenAt: true },
    });

    return device;
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop sending push notifications to this installation' })
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<void> {
    // Scoped to the caller: a token you do not own is not yours to delete.
    await this.prisma.deviceToken.deleteMany({ where: { token, userId: user.id } });
  }
}
