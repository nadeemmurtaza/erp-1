/** Its own localStorage/IndexedDB namespace — a till session is not an admin-panel session, even signed in as the same staff account on the same machine. */
export const STORAGE_KEYS = {
  access: 'pos.access_token',
  refresh: 'pos.refresh_token',
  user: 'pos.user',
  terminalId: 'pos.terminal_id',
  shiftId: 'pos.shift_id',
} as const;

export const OUTBOX_DB_NAME = 'newax-pos-outbox';
export const OUTBOX_STORE_NAME = 'sales';
