import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';

describe('PurchasingService', () => {
  let service: PurchasingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: {} },
        { provide: CatalogService, useValue: {} },
      ],
    }).compile();

    service = module.get<PurchasingService>(PurchasingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
