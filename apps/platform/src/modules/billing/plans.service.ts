import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { PlatformPlan } from '../../core/prisma/client';
import type { CreatePlanDto } from './dto/create-plan.dto';

/** WO-50.1/50.5 — the plan catalogue itself: create and list, each of the
 *  three pricing shapes validated for the fields its own model needs. */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlanDto): Promise<PlatformPlan> {
    const existing = await this.prisma.platformPlan.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`A plan with key "${dto.key}" already exists.`);

    if (dto.pricingModel === 'PER_SEAT' && dto.perSeatPriceMinor == null) {
      throw new BadRequestException('perSeatPriceMinor is required for a PER_SEAT plan.');
    }
    if (dto.pricingModel === 'ONE_TIME_LICENSE' && (dto.oneTimeLicenseMinor == null || !dto.licenseDeploymentMode)) {
      throw new BadRequestException('oneTimeLicenseMinor and licenseDeploymentMode are required for a ONE_TIME_LICENSE plan.');
    }

    return this.prisma.platformPlan.create({
      data: {
        key: dto.key,
        editionCap: dto.editionCap,
        includedResourceTier: dto.includedResourceTier,
        pricingModel: dto.pricingModel,
        monthlyPriceMinor: dto.pricingModel === 'FLAT_MONTHLY' ? (dto.monthlyPriceMinor ?? 0) : 0,
        perSeatPriceMinor: dto.pricingModel === 'PER_SEAT' ? dto.perSeatPriceMinor : null,
        oneTimeLicenseMinor: dto.pricingModel === 'ONE_TIME_LICENSE' ? dto.oneTimeLicenseMinor : null,
        licenseDeploymentMode: dto.pricingModel === 'ONE_TIME_LICENSE' ? dto.licenseDeploymentMode : null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list(): Promise<PlatformPlan[]> {
    return this.prisma.platformPlan.findMany({ orderBy: { key: 'asc' } });
  }
}
