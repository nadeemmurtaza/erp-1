import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MeasurementFieldDto } from './dto/measurements.dto';

/**
 * Guards against the exact bug this test was added for: a seeded
 * measurement field (Kameez's "slit_height", min: 0) that violated the
 * admin API's own MeasurementFieldDto rules (min >= 0.25), so saving that
 * garment from the admin UI 400'd unconditionally — the seed and the DTO
 * had drifted apart with nothing to catch it. Runs the same
 * class-validator rules the PATCH endpoint runs, against every field
 * actually in the (seeded) database, so a future field with the same
 * problem fails here instead of at save time in front of a user.
 */
describe('seeded measurement fields satisfy MeasurementFieldDto', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    prisma = module.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('every field passes the same validation the admin save endpoint runs', async () => {
    const fields = await prisma.measurementField.findMany({
      include: { garmentType: { select: { labelEn: true } } },
    });
    expect(fields.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const field of fields) {
      const dto = plainToInstance(MeasurementFieldDto, {
        key: field.key,
        labelEn: field.labelEn,
        labelUr: field.labelUr,
        unit: field.unit,
        min: field.min,
        max: field.max,
        required: field.required,
        order: field.order,
        helpEn: field.helpEn ?? undefined,
        helpUr: field.helpUr ?? undefined,
        isActive: field.isActive,
      });
      const errors = await validate(dto);
      if (errors.length > 0) {
        const constraints = errors
          .map((error) => Object.values(error.constraints ?? {}).join('; '))
          .join('; ');
        failures.push(`${field.garmentType.labelEn} / ${field.key}: ${constraints}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
