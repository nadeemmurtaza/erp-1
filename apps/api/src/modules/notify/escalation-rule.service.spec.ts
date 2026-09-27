import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EscalationRuleService } from './escalation-rule.service';

describe('EscalationRuleService', () => {
  let service: EscalationRuleService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { escalationRule: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [EscalationRuleService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(EscalationRuleService);
  });

  it('refuses a second rule for a sourceType that already has one', async () => {
    prisma.escalationRule.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.create({ sourceType: 'requisition', afterMinutes: 60 })).rejects.toThrow(ConflictException);
  });

  it('refuses updating a rule that does not exist', async () => {
    prisma.escalationRule.findUnique.mockResolvedValue(null);
    await expect(service.update('missing', { afterMinutes: 30 })).rejects.toThrow(NotFoundException);
  });

  it('refuses removing a rule that does not exist', async () => {
    prisma.escalationRule.findUnique.mockResolvedValue(null);
    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });
});
