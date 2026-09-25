import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SegmentFilter } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';
import { segmentFilterToWhere } from '../../core/crm/segment-filter-engine';
import type { CreateSegmentDto, UpdateSegmentDto } from './dto/segment.dto';

function validateFilter(filter: Record<string, unknown>): void {
  if (!Array.isArray((filter as { all?: unknown }).all)) {
    throw new BadRequestException('A segment filter must be shaped { all: SegmentFilterCondition[] }');
  }
}

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  listSegments() {
    return this.prisma.segment.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getSegment(id: string) {
    const segment = await this.prisma.segment.findUnique({ where: { id } });
    if (!segment) throw new NotFoundException('Segment not found');
    return segment;
  }

  async createSegment(dto: CreateSegmentDto, createdById: string | null) {
    validateFilter(dto.filter);
    return this.prisma.segment.create({
      data: {
        name: dto.name,
        description: dto.description,
        filter: dto.filter as Prisma.InputJsonValue,
        createdById,
      },
    });
  }

  async updateSegment(id: string, dto: UpdateSegmentDto) {
    await this.getSegment(id);
    if (dto.filter) validateFilter(dto.filter);
    return this.prisma.segment.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        filter: dto.filter as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async deleteSegment(id: string): Promise<void> {
    await this.getSegment(id);
    await this.prisma.segment.delete({ where: { id } });
  }

  /** The audience a Campaign actually sends to (marketing.prisma, WO-8.4). */
  async resolveMembers(segmentId: string) {
    const segment = await this.getSegment(segmentId);
    return this.prisma.contact.findMany({ where: segmentFilterToWhere(segment.filter as unknown as SegmentFilter) });
  }

  async previewCount(filter: Record<string, unknown>): Promise<number> {
    validateFilter(filter);
    return this.prisma.contact.count({ where: segmentFilterToWhere(filter as unknown as SegmentFilter) });
  }
}
