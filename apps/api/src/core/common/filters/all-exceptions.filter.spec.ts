import { BadRequestException, HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { LoginRateLimitedException } from '../../auth/login-throttle.service';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter — Retry-After (206-rate-limiting-caching-compression-hardening.md §1.2)', () => {
  let response: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let host: ArgumentsHost;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    response = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
    response.status.mockReturnValue(response);
    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'POST', url: '/api/v1/auth/login' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders the per-account 429 as doc 206 specifies: retryAfterSeconds and message in the body, the same number in Retry-After', () => {
    new AllExceptionsFilter().catch(new LoginRateLimitedException(288), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '288');
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        retryAfterSeconds: 288,
        message: 'Too many attempts. Try again in 288 seconds.',
      }),
    );
  });

  it('adds nothing to an exception that does not know when to retry', () => {
    new AllExceptionsFilter().catch(new BadRequestException('Enter your password.'), host);

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.json.mock.calls[0][0]).not.toHaveProperty('retryAfterSeconds');
  });

  it('leaves ThrottlerGuard\'s own 429 as it was — its Retry-After is set by the guard itself', () => {
    new AllExceptionsFilter().catch(new ThrottlerException(), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it.each([[-1], [1.5], ['288'], [null]])('ignores a retryAfterSeconds that is not a whole, non-negative number (%p)', (value) => {
    new AllExceptionsFilter().catch(new HttpException({ message: 'x', retryAfterSeconds: value }, 429), host);

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.json.mock.calls[0][0]).not.toHaveProperty('retryAfterSeconds');
  });
});

describe('AllExceptionsFilter — a machine-readable reason', () => {
  let response: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let host: ArgumentsHost;
  const body = () => response.json.mock.calls[0][0];

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    response = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
    response.status.mockReturnValue(response);
    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'POST', url: '/api/v1/auctions/lots/l1/bids' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes a well-formed code and flat details through beside the message', () => {
    new AllExceptionsFilter().catch(
      new HttpException({ message: 'Too low.', code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 105_000 } }, HttpStatus.CONFLICT),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(body()).toMatchObject({ statusCode: 409, error: 'CONFLICT', message: 'Too low.', code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 105_000 } });
  });

  it('adds nothing to an exception that names no code', () => {
    new AllExceptionsFilter().catch(new HttpException({ message: 'x' }, 409), host);
    expect(body()).not.toHaveProperty('code');
    expect(body()).not.toHaveProperty('details');
  });

  it.each([['bid_too_low'], ['X'], ['HAS SPACE'], [42], [null], ['A'.repeat(70)]])('ignores a code that is not SCREAMING_SNAKE_CASE (%p)', (code) => {
    new AllExceptionsFilter().catch(new HttpException({ message: 'x', code, details: { a: 1 } }, 409), host);
    expect(body()).not.toHaveProperty('code');
    expect(body()).not.toHaveProperty('details');
  });

  it('keeps only primitive details, and drops details with no code to belong to', () => {
    new AllExceptionsFilter().catch(
      new HttpException({ message: 'x', code: 'SOME_CODE', details: { ok: 'a', n: 1, b: true, z: null, nested: { a: 1 }, list: [1] } }, 409),
      host,
    );
    expect(body().details).toEqual({ ok: 'a', n: 1, b: true, z: null });

    response.json.mockClear();
    new AllExceptionsFilter().catch(new HttpException({ message: 'x', details: { a: 1 } }, 409), host);
    expect(body()).not.toHaveProperty('details');
  });

  it('refuses to pass more than ten detail keys, so an exception cannot smuggle a payload', () => {
    const details = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`k${index}`, index]));
    new AllExceptionsFilter().catch(new HttpException({ message: 'x', code: 'SOME_CODE', details }, 409), host);
    expect(body().code).toBe('SOME_CODE');
    expect(body()).not.toHaveProperty('details');
  });
});
