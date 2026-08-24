'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CustomerAddress } from '@/lib/api-types';
import { customerFetch } from '@/lib/customer-client';

interface Draft {
  id?: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
}

const BLANK: Draft = {
  label: '',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  isDefault: false,
};

export default function AccountAddressesPage() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAddresses(await customerFetch<CustomerAddress[]>('/addresses'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your addresses');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const payload = {
      label: draft.label || undefined,
      fullName: draft.fullName,
      phone: draft.phone,
      line1: draft.line1,
      line2: draft.line2 || undefined,
      city: draft.city,
      province: draft.province,
      postalCode: draft.postalCode || undefined,
      isDefault: draft.isDefault,
    };

    try {
      if (draft.id) {
        await customerFetch(`/addresses/${draft.id}`, { method: 'PATCH', body: payload });
      } else {
        await customerFetch('/addresses', { method: 'POST', body: payload });
      }
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the address');
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: CustomerAddress) {
    setError(null);
    try {
      await customerFetch(`/addresses/${address.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the address');
    }
  }

  function edit(address: CustomerAddress) {
    setDraft({
      id: address.id,
      label: address.label ?? '',
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      province: address.province,
      postalCode: address.postalCode ?? '',
      isDefault: address.isDefault,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="card p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {addresses.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink/50">
            No saved addresses yet — add one to speed up checkout.
          </div>
        ) : (
          addresses.map((address) => (
            <div key={address.id} className="card flex items-start justify-between p-4">
              <div>
                <p className="font-medium text-ink">
                  {address.label || address.fullName}
                  {address.isDefault ? (
                    <span className="ms-2 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-ink/70">
                  {address.fullName} · {address.phone}
                </p>
                <p className="text-sm text-ink/60">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.province}
                  {address.postalCode ? ` ${address.postalCode}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => edit(address)}
                  className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(address)}
                  className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={save} className="card h-fit space-y-4 p-4">
        <h2 className="text-sm font-semibold text-ink">
          {draft.id ? 'Edit address' : 'Add an address'}
        </h2>

        <label className="block">
          <span className="field-label">Label (optional)</span>
          <input
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            placeholder="Home, Office…"
            className="field-input"
          />
        </label>

        <label className="block">
          <span className="field-label">Full name</span>
          <input
            value={draft.fullName}
            onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
            required
            className="field-input"
          />
        </label>

        <label className="block">
          <span className="field-label">Phone</span>
          <input
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            required
            className="field-input"
          />
        </label>

        <label className="block">
          <span className="field-label">Address line 1</span>
          <input
            value={draft.line1}
            onChange={(event) => setDraft({ ...draft, line1: event.target.value })}
            required
            className="field-input"
          />
        </label>

        <label className="block">
          <span className="field-label">Address line 2</span>
          <input
            value={draft.line2}
            onChange={(event) => setDraft({ ...draft, line2: event.target.value })}
            className="field-input"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">City</span>
            <input
              value={draft.city}
              onChange={(event) => setDraft({ ...draft, city: event.target.value })}
              required
              className="field-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Province</span>
            <input
              value={draft.province}
              onChange={(event) => setDraft({ ...draft, province: event.target.value })}
              required
              className="field-input"
            />
          </label>
        </div>

        <label className="block">
          <span className="field-label">Postal code</span>
          <input
            value={draft.postalCode}
            onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })}
            className="field-input"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })}
            className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
          />
          Make this my default address
        </label>

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="btn-primary">
            {draft.id ? 'Save' : 'Add'}
          </button>
          {draft.id ? (
            <button type="button" onClick={() => setDraft(BLANK)} className="btn-ghost">
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
