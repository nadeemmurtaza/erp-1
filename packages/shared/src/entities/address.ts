/**
 * Address getters. Structurally compatible with both the Address model
 * (the saved address book) and Order.shippingAddress/billingAddress, which
 * are JSON snapshots of the same shape taken at checkout — never a foreign
 * key, since the address book is editable after an order ships.
 */
export interface AddressLike {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  province: string;
  postalCode?: string | null;
  country?: string | null;
}

/** "House 12, Street 5, Karachi, Sindh" — everything but name/phone/country, comma-joined. */
export function getFormattedAddress(address: AddressLike): string {
  return [address.line1, address.line2, address.city, address.province, address.postalCode]
    .filter(Boolean)
    .join(', ');
}

/** "Karachi, Sindh" — the short form for a list row. */
export function getAddressCityProvince(address: AddressLike): string {
  return [address.city, address.province].filter(Boolean).join(', ');
}
