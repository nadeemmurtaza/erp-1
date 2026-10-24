import { FeatureFlagAuditCron } from './feature-flag-audit.cron';

describe('FeatureFlagAuditCron — WO-37.3', () => {
  it('does nothing when no flag is stale', async () => {
    const admin = { listStale: jest.fn().mockResolvedValue([]) };
    const cron = new FeatureFlagAuditCron(admin as any);

    await expect(cron.auditStaleFlags()).resolves.toBeUndefined();
    expect(admin.listStale).toHaveBeenCalled();
  });

  it('logs a warning naming every stale flag, never silently ignored', async () => {
    const admin = { listStale: jest.fn().mockResolvedValue([{ key: 'a.flag' }, { key: 'b.flag' }]) };
    const cron = new FeatureFlagAuditCron(admin as any);
    const warnSpy = jest.spyOn((cron as any).logger, 'warn');

    await cron.auditStaleFlags();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('a.flag'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('b.flag'));
  });

  it('never throws when the lookup fails — a cron failure must not block the rest of the scheduler', async () => {
    const admin = { listStale: jest.fn().mockRejectedValue(new Error('db down')) };
    const cron = new FeatureFlagAuditCron(admin as any);

    await expect(cron.auditStaleFlags()).resolves.toBeUndefined();
  });
});
