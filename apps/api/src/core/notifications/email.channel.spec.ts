import { isDeliverable } from './email.channel';

/**
 * Guards the gate in front of the mail server.
 *
 * A hard bounce costs a young sending domain more than a missed email does:
 * receivers read a bounce rate as a sign the sender is working from a bought
 * list. Anything obviously undeliverable should never leave the building.
 */
describe('isDeliverable', () => {
  it.each([
    'ayesha@example.com',
    'sania.mehreen917@gmail.com',
    'first+order@sub.yaseen.pk',
    'a@b.co',
  ])('accepts %s', (address) => {
    expect(isDeliverable(address)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['no domain', 'ayesha'],
    ['no user', '@example.com'],
    ['no dot in the domain', 'ayesha@localhost'],
    ['a stray space', 'ayesha @example.com'],
    ['two addresses in one field', 'a@b.com, c@d.com'],
    ['a trailing dot', 'ayesha@example.'],
    ['a phone number pasted into the email box', '03001234567'],
  ])('rejects %s', (_label, address) => {
    expect(isDeliverable(address)).toBe(false);
  });

  it('trims before judging, since checkout forms collect stray whitespace', () => {
    expect(isDeliverable('  ayesha@example.com  ')).toBe(true);
  });

  it('rejects an address past the 254-character limit', () => {
    expect(isDeliverable(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});
