/**
 * Extension point: identity-verification providers.
 *
 * nID is the only implementation today (NidVerificationProvider). The
 * interface exists anyway — house rule 8 — because this is exactly the kind
 * of external integration that gets a second implementation (a different
 * KYC vendor, a mock for tests) without anyone touching
 * IdentityVerificationService.
 */

export interface IdentityVerificationSubject {
  /** This shop's own id for the person — sent to nID as the Subject's externalRef. */
  userId: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  /** E.164. */
  phone: string | null;
  /**
   * A prior nID Subject.id for this user, if one was already created. nID's
   * Phase 0 does not dedupe subjects by externalRef itself — passing this
   * skips subject creation and starts a new case against the existing one,
   * which is what makes a retry after EXPIRED/REJECTED not pile up
   * duplicate Subjects on nID's side.
   */
  existingProviderSubjectId?: string | null;
}

export interface IdentityVerificationStart {
  /** The provider's id for the subject record (nID's Subject.id). */
  providerSubjectId: string;
  /** The provider's id for this verification attempt (nID's VerificationCase.id). */
  providerCaseId: string;
  status: 'PENDING';
}

export interface IdentityVerificationCallbackResult {
  providerCaseId: string;
  status: 'APPROVED' | 'REJECTED' | 'EXPIRED';
  raw: Record<string, unknown>;
  /**
   * False when the callback did not prove it came from the provider — a bad
   * signature, or none at all. Distinct from a genuine REJECTED/EXPIRED
   * result. Callers must refuse to change verification state when this is
   * false, exactly as PaymentCallbackResult.verified gates payment writes.
   */
  verified?: boolean;
}

export interface IdentityVerificationProvider {
  /** Stable key. Not currently allowlist-selected (there is one provider) — see NidVerificationProvider. */
  readonly key: string;

  /** Creates the subject (unless existingProviderSubjectId is given) and starts a verification case. */
  start(subject: IdentityVerificationSubject): Promise<IdentityVerificationStart>;

  /** Forwards a subject-submitted OTP code to the provider's case. */
  submitOtp(providerCaseId: string, code: string): Promise<void>;

  /**
   * Interprets an inbound webhook call, verifying its signature.
   *
   * Takes the raw body string rather than a parsed object — unlike
   * PaymentProvider.handleCallback, which verifies individual signed form
   * fields, nID signs the exact JSON bytes it sent
   * (HMAC-SHA256 over `${timestamp}.${rawBody}`), so re-serializing a
   * parsed object could produce a byte-different string and fail
   * verification even for a genuine callback. The controller reads this
   * from the raw body Express captures — see main.ts's `rawBody: true`.
   */
  handleCallback(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<IdentityVerificationCallbackResult>;
}
