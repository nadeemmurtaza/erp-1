/**
 * The three ways an auction can vet who may bid (launchpad-apps/
 * 234-auction-app.md §8, WO-234.5), in the words the organiser reads. The values
 * are the API's `AuctionRegistration`; the words are the page's, because the
 * names of the rules ("OPEN", "VERIFIED", "APPROVAL") are not what a person
 * running a sale would choose between.
 */
export type AuctionRegistrationMode = 'OPEN' | 'VERIFIED' | 'APPROVAL';

export const REGISTRATION_CHOICES: ReadonlyArray<{ value: AuctionRegistrationMode; label: string; hint: string }> = [
  { value: 'OPEN', label: 'Anyone signed in', hint: 'Anyone with an account can bid.' },
  { value: 'VERIFIED', label: 'Verified customers, others approved', hint: 'Verified customers bid at once. Everyone else waits for you to approve them.' },
  { value: 'APPROVAL', label: 'Approved customers', hint: 'Everyone waits for you to approve them, verified or not.' },
];

/** The choice a stored mode names. An unknown value reads as the strictest rule, which is also the default for a new auction. */
export function registrationChoice(mode: AuctionRegistrationMode | undefined): (typeof REGISTRATION_CHOICES)[number] {
  return REGISTRATION_CHOICES.find((choice) => choice.value === mode) ?? REGISTRATION_CHOICES[2]!;
}
