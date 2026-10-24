import { ApiVersionPolicyService } from './api-version-policy.service';

describe('ApiVersionPolicyService — WO-37.1', () => {
  it('has no registered deprecation by default — nothing has ever been deprecated', () => {
    const service = new ApiVersionPolicyService();
    expect(service.getDeprecation('1')).toBeUndefined();
    expect(service.isSunset('1')).toBe(false);
  });

  it('returns a registered deprecation entry', () => {
    const service = new ApiVersionPolicyService();
    const since = new Date('2026-01-01T00:00:00Z');
    const sunsetAt = new Date('2027-01-01T00:00:00Z');

    service.registerDeprecation('1', { since, sunsetAt });

    expect(service.getDeprecation('1')).toEqual({ since, sunsetAt });
  });

  it('is not sunset before its sunsetAt date', () => {
    const service = new ApiVersionPolicyService();
    service.registerDeprecation('1', { since: new Date('2026-01-01'), sunsetAt: new Date('2027-01-01') });

    expect(service.isSunset('1', new Date('2026-06-01'))).toBe(false);
  });

  it('is sunset on or after its sunsetAt date', () => {
    const service = new ApiVersionPolicyService();
    const sunsetAt = new Date('2027-01-01');
    service.registerDeprecation('1', { since: new Date('2026-01-01'), sunsetAt });

    expect(service.isSunset('1', sunsetAt)).toBe(true);
    expect(service.isSunset('1', new Date('2028-01-01'))).toBe(true);
  });

  it('clearDeprecation removes a registered entry', () => {
    const service = new ApiVersionPolicyService();
    service.registerDeprecation('1', { since: new Date(), sunsetAt: new Date() });
    service.clearDeprecation('1');

    expect(service.getDeprecation('1')).toBeUndefined();
  });
});
