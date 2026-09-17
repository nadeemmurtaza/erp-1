import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AppConfigService } from '../../core/config/app-config.service';

describe('PurchasingService', () => {
  let service: PurchasingService;

  beforeEach(async () => {
    // Every constructor dependency is stubbed. When a new one is injected this
    // suite fails to compile the module, which is the point — it is the cheap
    // guard that caught the receipt service growing two dependencies silently.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: {} },
        { provide: InventoryService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: AppConfigService, useValue: {} },
        { provide: EventBusService, useValue: {} },
      ],
    }).compile();

    service = module.get<PurchasingService>(PurchasingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
