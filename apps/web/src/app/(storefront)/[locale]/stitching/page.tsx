'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { validateMeasurements, type Locale } from '@yaseen/shared';
import { useRouter } from '@/i18n/navigation';
import { API_URL } from '@/lib/api';
import type { GarmentType } from '@/types/api';
import { getCustomerToken } from '@/lib/cart-client';
import type { MeasurementProfileSummary } from '@/types/cart';

interface GarmentDraft {
  /** Local key so React can track rows the customer adds and removes. */
  uid: number;
  garmentTypeId: string;
  measurementProfileId: string;
  values: Record<string, string>;
  instructions: string;
}

let nextUid = 1;

function emptyGarment(garmentTypeId: string): GarmentDraft {
  return {
    uid: nextUid++,
    garmentTypeId,
    measurementProfileId: '',
    values: {},
    instructions: '',
  };
}

/**
 * Booking tailoring on fabric the customer already owns.
 *
 * No account needed: a guest types their measurements in and tracks the booking
 * with the phone number they gave. A signed-in customer can pick a saved profile
 * instead. Measurements are checked here with the same validator the API uses,
 * so a mistyped figure is caught before the form is sent.
 */
export default function BookStitchingPage() {
  const t = useTranslations('stitching');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [profiles, setProfiles] = useState<MeasurementProfileSummary[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fabricNotes, setFabricNotes] = useState('');
  const [address, setAddress] = useState({ line1: '', city: '' });
  const [garments, setGarments] = useState<GarmentDraft[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = getCustomerToken();
    setSignedIn(Boolean(token));

    void fetch(`${API_URL}/measurements/garment-types`)
      .then((response) => (response.ok ? response.json() : []))
      .then((loaded: GarmentType[]) => {
        setGarmentTypes(loaded);
        if (loaded[0]) setGarments([emptyGarment(loaded[0].id)]);
      });

    if (token) {
      void fetch(`${API_URL}/measurements/profiles`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => (response.ok ? response.json() : []))
        .then((loaded: MeasurementProfileSummary[]) => setProfiles(loaded));
    }
  }, []);

  function update(uid: number, patch: Partial<GarmentDraft>) {
    setGarments((current) =>
      current.map((garment) => (garment.uid === uid ? { ...garment, ...patch } : garment)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (garments.length === 0) {
      setError(t('addOneGarment'));
      return;
    }

    // Build the payload and validate every typed-in set against the garment's
    // own fields before anything leaves the browser.
    const payload: Array<Record<string, unknown>> = [];

    for (const garment of garments) {
      const type = garmentTypes.find((candidate) => candidate.id === garment.garmentTypeId);
      if (!type) continue;

      if (garment.measurementProfileId) {
        payload.push({
          garmentTypeId: garment.garmentTypeId,
          measurementProfileId: garment.measurementProfileId,
          instructions: garment.instructions || undefined,
        });
        continue;
      }

      const typed: Record<string, number> = {};
      for (const [key, raw] of Object.entries(garment.values)) {
        if (raw.trim() === '') continue;
        typed[key] = Number(raw);
      }

      const check = validateMeasurements(type.fields, typed);
      if (!check.valid) {
        setError(`${type.labelEn}: ${check.errors.map((issue) => issue.message).join(', ')}`);
        return;
      }

      payload.push({
        garmentTypeId: garment.garmentTypeId,
        measurements: check.values,
        instructions: garment.instructions || undefined,
      });
    }

    setBusy(true);
    try {
      const token = getCustomerToken();
      const response = await fetch(`${API_URL}/stitching/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          garments: payload,
          fabricNotes: fabricNotes || undefined,
          pickupAddress: address.line1 ? address : undefined,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { message?: string | string[] }
          | undefined;
        const message = Array.isArray(body?.message) ? body?.message.join('\n') : body?.message;
        setError(message ?? t('bookingFailed'));
        return;
      }

      const booking = (await response.json()) as { number: string };
      // Remember the phone for this tab so the customer's own booking opens
      // straight away instead of asking them to prove who they are.
      sessionStorage.setItem(`yaseen.stitching.${booking.number}`, phone);
      router.push(`/stitching/${booking.number}?booked=1`);
    } catch {
      setError(t('bookingFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">{t('bookTitle')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-900/60">{t('bookIntro')}</p>

      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {garments.map((garment, index) => {
            const type = garmentTypes.find((candidate) => candidate.id === garment.garmentTypeId);
            const matching = profiles.filter(
              (profile) => profile.garmentType.id === garment.garmentTypeId,
            );

            return (
              <section key={garment.uid} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    {t('garmentNumber', { number: index + 1 })}
                  </h2>
                  {garments.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-red-700 hover:underline"
                      onClick={() =>
                        setGarments((current) =>
                          current.filter((candidate) => candidate.uid !== garment.uid),
                        )
                      }
                    >
                      {t('remove')}
                    </button>
                  ) : null}
                </div>

                <label className="mt-3 block">
                  <span className="field-label">{t('garment')}</span>
                  <select
                    className="field-input"
                    value={garment.garmentTypeId}
                    onChange={(event) =>
                      update(garment.uid, {
                        garmentTypeId: event.target.value,
                        measurementProfileId: '',
                        values: {},
                      })
                    }
                  >
                    {garmentTypes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {locale === 'ur' ? option.labelUr : option.labelEn}
                      </option>
                    ))}
                  </select>
                </label>

                {signedIn && matching.length > 0 ? (
                  <label className="mt-3 block">
                    <span className="field-label">{t('savedMeasurements')}</span>
                    <select
                      className="field-input"
                      value={garment.measurementProfileId}
                      onChange={(event) =>
                        update(garment.uid, { measurementProfileId: event.target.value })
                      }
                    >
                      <option value="">{t('typeThemIn')}</option>
                      {matching.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {!garment.measurementProfileId && type ? (
                  <fieldset className="mt-4">
                    <legend className="field-label">{t('measurements')}</legend>
                    <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {type.fields.map((field) => (
                        <label key={field.id} className="block text-sm">
                          <span className="text-neutral-900/70">
                            {locale === 'ur' ? field.labelUr : field.labelEn}
                            {field.required ? ' *' : ''}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step={0.25}
                            min={field.min}
                            max={field.max}
                            required={field.required}
                            value={garment.values[field.key] ?? ''}
                            onChange={(event) =>
                              update(garment.uid, {
                                values: { ...garment.values, [field.key]: event.target.value },
                              })
                            }
                            className="field-input"
                          />
                          <span className="text-xs text-neutral-900/40">
                            {field.unit === 'CM' ? 'cm' : 'in'} · {field.min}–{field.max}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <label className="mt-4 block">
                  <span className="field-label">{t('notes')}</span>
                  <input
                    className="field-input"
                    value={garment.instructions}
                    placeholder={t('notesPlaceholder')}
                    onChange={(event) =>
                      update(garment.uid, { instructions: event.target.value })
                    }
                  />
                </label>
              </section>
            );
          })}

          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setGarments((current) => [
                ...current,
                emptyGarment(garmentTypes[0]?.id ?? ''),
              ])
            }
            disabled={garmentTypes.length === 0}
          >
            {t('addGarment')}
          </button>
        </div>

        <aside className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('yourDetails')}</h2>

            <label className="block">
              <span className="field-label">{t('name')}</span>
              <input
                className="field-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
              />
            </label>

            <label className="block">
              <span className="field-label">{t('phone')}</span>
              <input
                className="field-input"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                inputMode="tel"
                placeholder="03001234567"
                autoComplete="tel"
              />
            </label>

            <label className="block">
              <span className="field-label">{t('emailOptional')}</span>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="field-label">{t('pickupAddress')}</span>
              <input
                className="field-input"
                value={address.line1}
                placeholder={t('pickupPlaceholder')}
                onChange={(event) =>
                  setAddress((current) => ({ ...current, line1: event.target.value }))
                }
              />
            </label>

            <label className="block">
              <span className="field-label">{t('city')}</span>
              <input
                className="field-input"
                value={address.city}
                onChange={(event) =>
                  setAddress((current) => ({ ...current, city: event.target.value }))
                }
              />
            </label>

            <label className="block">
              <span className="field-label">{t('fabricNotes')}</span>
              <textarea
                className="field-input"
                rows={3}
                value={fabricNotes}
                placeholder={t('fabricPlaceholder')}
                onChange={(event) => setFabricNotes(event.target.value)}
              />
            </label>

            {error ? (
              <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t('booking') : t('book')}
            </button>

            <p className="text-xs text-neutral-900/50">{t('quoteLater')}</p>
          </section>
        </aside>
      </form>
    </div>
  );
}
