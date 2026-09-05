import { isValidUnsubscribeToken, unsubscribeToken } from './unsubscribe-token';

describe('unsubscribeToken / isValidUnsubscribeToken', () => {
  const key = 'a'.repeat(32);

  it('accepts a valid token', () => {
    const token = unsubscribeToken('user1', key);
    expect(isValidUnsubscribeToken('user1', token, key)).toBe(true);
  });

  it('is deterministic for the same user and key', () => {
    expect(unsubscribeToken('user1', key)).toBe(unsubscribeToken('user1', key));
  });

  it('rejects a tampered token', () => {
    const token = unsubscribeToken('user1', key);
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(isValidUnsubscribeToken('user1', tampered, key)).toBe(false);
  });

  it('rejects a token issued for a different user id', () => {
    const token = unsubscribeToken('user1', key);
    expect(isValidUnsubscribeToken('user2', token, key)).toBe(false);
  });

  it('rejects a token issued with a different key', () => {
    const token = unsubscribeToken('user1', key);
    expect(isValidUnsubscribeToken('user1', token, 'b'.repeat(32))).toBe(false);
  });

  it('rejects an empty token without throwing', () => {
    expect(isValidUnsubscribeToken('user1', '', key)).toBe(false);
  });
});
