import type { EmailAccount, EmailAccountPurpose } from '@/types/api';

/**
 * A connected mailbox as form state.
 *
 * Shared between the list and the editor once they became separate routes:
 * the list reads the purpose labels, the editor drafts every field.
 *
 * Passwords are deliberately never read back from the API — `formFromAccount`
 * leaves them blank and the editor sends them only when non-empty, so saving
 * a label does not wipe a stored credential.
 */

export const PURPOSES: { value: EmailAccountPurpose; label: string; hint: string }[] = [
  {
    value: 'TRANSACTIONAL',
    label: 'Transactional',
    hint: 'Orders, payments, password resets — the fallback every other purpose can use.',
  },
  {
    value: 'MARKETING',
    label: 'Marketing',
    hint: 'Campaign sends: sales, launches, flash offers.',
  },
  {
    value: 'SUPPORT',
    label: 'Support',
    hint: 'Customer-service correspondence. Nothing sends here automatically yet — no support-mail template exists.',
  },
];

export function purposeLabel(purpose: EmailAccountPurpose): string {
  return PURPOSES.find((candidate) => candidate.value === purpose)?.label ?? purpose;
}

export interface FormState {
  label: string;
  purpose: EmailAccountPurpose;
  isActive: boolean;
  isDefault: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  includeImap: boolean;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUser: string;
  imapPassword: string;
}

export const EMPTY_FORM: FormState = {
  label: '',
  purpose: 'TRANSACTIONAL',
  isActive: true,
  isDefault: false,
  fromName: '',
  fromEmail: '',
  replyTo: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  includeImap: false,
  imapHost: '',
  imapPort: '993',
  imapSecure: true,
  imapUser: '',
  imapPassword: '',
};

export function formFromAccount(account: EmailAccount): FormState {
  return {
    label: account.label,
    purpose: account.purpose,
    isActive: account.isActive,
    isDefault: account.isDefault,
    fromName: account.fromName,
    fromEmail: account.fromEmail,
    replyTo: account.replyTo ?? '',
    smtpHost: account.smtpHost,
    smtpPort: String(account.smtpPort),
    smtpSecure: account.smtpSecure,
    smtpUser: account.smtpUser,
    smtpPassword: '',
    includeImap: Boolean(account.imapHost),
    imapHost: account.imapHost ?? '',
    imapPort: String(account.imapPort ?? 993),
    imapSecure: account.imapSecure,
    imapUser: account.imapUser ?? '',
    imapPassword: '',
  };
}
