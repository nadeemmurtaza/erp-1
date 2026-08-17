/**
 * Extension point: outbound customer messaging.
 *
 * Today only `log` is enabled, which writes messages to the application log so
 * every notification path is exercised in development without a provider
 * account. Email, WhatsApp and SMS channels are new classes implementing this
 * interface plus an entry in NOTIFICATION_CHANNELS — no caller changes.
 */
export interface NotificationRecipient {
  name?: string | null;
  email?: string | null;
  /** Normalised E.164 phone number. */
  phone?: string | null;
  /**
   * Set when the recipient has an account. Channels that reach a person through
   * something they signed into — push notifications, for one — need this rather
   * than a phone number.
   */
  userId?: string | null;
  locale?: 'en' | 'ur';
}

export interface NotificationMessage {
  /** Template key, e.g. "order.confirmed" or "stitching.ready". */
  template: string;
  recipient: NotificationRecipient;
  subject: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: string;
  /** Whether this channel can reach the recipient (has a phone, an email…). */
  supports(message: NotificationMessage): boolean;
  send(message: NotificationMessage): Promise<void>;
}
