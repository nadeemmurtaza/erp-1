'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { computeStitchingFee, formatMoney, type Locale } from '@yaseen/shared';
import { API_URL } from '@/lib/api';
import type { StorefrontProduct } from '@/lib/api-types';
import { getCustomerToken } from '@/lib/cart-client';
import type { MeasurementProfileSummary, StitchingOptionGroup } from '@/lib/cart-types';

export interface StitchingSelection {
  stitchingServiceId: string;
  measurementProfileId?: string;
  optionIds: string[];
  notes?: string;
}

interface StitchingPanelProps {
  product: StorefrontProduct;
  services: StorefrontProduct[];
  onChange: (selection: StitchingSelection | null) => void;
}

/**
 * "Get it stitched": garment → service → measurements → style options, with the
 * price moving as the customer chooses.
 *
 * The running total uses the same computeStitchingFee the API uses, so the
 * figure here is the figure charged — no second implementation to drift.
 * Measurement profiles need an account, so a guest is told to sign in rather
 * than being blocked from adding the fabric itself.
 */
export function StitchingPanel({ product, services, onChange }: StitchingPanelProps) {
  const t = useTranslations('stitching');
  const locale = useLocale() as Locale;

  const [enabled, setEnabled] = useState(false);
  const [garmentKey, setGarmentKey] = useState<string>(product.garmentTypes[0]?.key ?? '');
  const [serviceId, setServiceId] = useState<string>('');
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [groups, setGroups] = useState<StitchingOptionGroup[]>([]);
  const [profiles, setProfiles] = useState<MeasurementProfileSummary[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  const garment = product.garmentTypes.find((candidate) => candidate.key === garmentKey);

  useEffect(() => {
    setSignedIn(Boolean(getCustomerToken()));
  }, []);

  // Load the option groups and the customer's saved profiles for the chosen
  // garment. Both change whenever the garment does.
  useEffect(() => {
    if (!enabled || !garment) return;
    let cancelled = false;

    const token = getCustomerToken();

    void fetch(`${API_URL}/stitching/option-groups?garmentType=${garment.key}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((loaded: StitchingOptionGroup[]) => {
        if (cancelled) return;
        setGroups(loaded);
        // Preselect the zero-cost answer in each required group so the panel
        // starts in a valid, cheapest state rather than an error.
        setOptionIds(
          loaded
            .filter((group) => group.required)
            .map(
              (group) =>
                (group.options.find((option) => option.priceDelta === 0) ??
                  group.options[0])!.id,
            )
            .filter(Boolean),
        );
      })
      .catch(() => undefined);

    if (token) {
      void fetch(`${API_URL}/measurements/profiles`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
        .then((response) => (response.ok ? response.json() : []))
        .then((loaded: MeasurementProfileSummary[]) => {
          if (cancelled) return;
          const forGarment = loaded.filter(
            (profile) => profile.garmentType.key === garment.key,
          );
          setProfiles(forGarment);
          setProfileId(forGarment[0]?.id ?? '');
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [enabled, garment]);

  const applicableServices = useMemo(
    () =>
      services.filter((service) =>
        garment ? service.serviceGarment?.key === garment.key : false,
      ),
    [services, garment],
  );

  useEffect(() => {
    setServiceId((current) =>
      applicableServices.some((service) => service.id === current)
        ? current
        : (applicableServices[0]?.id ?? ''),
    );
  }, [applicableServices]);

  const service = applicableServices.find((candidate) => candidate.id === serviceId);

  const chosenOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        group.options.filter((option) => optionIds.includes(option.id)),
      ),
    [groups, optionIds],
  );

  const fee = service
    ? computeStitchingFee({
        baseFee: service.basePrice,
        optionDeltas: chosenOptions.map((option) => option.priceDelta),
      })
    : 0;

  // Publish the selection upward whenever any part of it changes.
  useEffect(() => {
    if (!enabled || !service) {
      onChange(null);
      return;
    }

    onChange({
      stitchingServiceId: service.id,
      measurementProfileId: profileId || undefined,
      optionIds,
      notes: notes.trim() || undefined,
    });
  }, [enabled, service, profileId, optionIds, notes, onChange]);

  if (!product.stitchingAvailable || product.garmentTypes.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-brand-200 bg-brand-50 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 rounded border-sand-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="block text-sm font-semibold text-brand-800">{t('getStitched')}</span>
          <span className="block text-sm text-ink/70">{t('explainer')}</span>
        </span>
      </label>

      <div className={clsx(
        'overflow-hidden transition-all duration-300',
        enabled ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="mt-4 space-y-4 border-t border-brand-200 pt-4">
          {product.garmentTypes.length > 1 ? (
            <Group label={t('garment')}>
              <div className="flex flex-wrap gap-2">
                {product.garmentTypes.map((option) => (
                  <Chip
                    key={option.key}
                    selected={option.key === garmentKey}
                    onClick={() => setGarmentKey(option.key)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </Group>
          ) : null}

          {applicableServices.length > 1 ? (
            <Group label={t('service')}>
              <div className="space-y-2">
                {applicableServices.map((option) => (
                  <label
                    key={option.id}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-200',
                      option.id === serviceId
                        ? 'border-brand-500 bg-white'
                        : 'border-sand-200 bg-white/60 hover:border-brand-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="stitching-service"
                      checked={option.id === serviceId}
                      onChange={() => setServiceId(option.id)}
                      className="mt-1 border-sand-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="flex-1">
                      <span className="flex justify-between gap-3">
                        <span className="text-sm font-medium text-ink">{option.name}</span>
                        <span className="text-sm font-medium text-ink">
                          {formatMoney(option.basePrice, locale)}
                        </span>
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-ink/60">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </Group>
          ) : null}

          {groups.map((group) => (
            <Group
              key={group.id}
              label={locale === 'ur' ? group.labelUr : group.labelEn}
              required={group.required}
            >
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const selected = optionIds.includes(option.id);
                  return (
                    <Chip
                      key={option.id}
                      selected={selected}
                      onClick={() =>
                        setOptionIds((current) => toggleOption(current, group, option.id))
                      }
                    >
                      {locale === 'ur' ? option.labelUr : option.labelEn}
                      {option.priceDelta !== 0 ? (
                        <span className="ms-1 text-xs opacity-80">
                          {option.priceDelta > 0 ? '+' : '−'}
                          {formatMoney(Math.abs(option.priceDelta), locale)}
                        </span>
                      ) : null}
                    </Chip>
                  );
                })}
              </div>
            </Group>
          ))}

          <Group label={t('measurements')} required>
            {!signedIn ? (
              <p className="rounded-md bg-white p-3 text-sm text-ink/70">
                {t('signInForMeasurements')}
              </p>
            ) : profiles.length === 0 ? (
              <p className="rounded-md bg-white p-3 text-sm text-ink/70">
                {t('noProfiles', { garment: garment?.label ?? '' })}
              </p>
            ) : (
              <select
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
                className="field-input max-w-sm"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            )}
          </Group>

          <Group label={t('notes')}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('notesPlaceholder')}
              className="field-input"
            />
          </Group>

          {service ? (
            <p className="flex items-baseline justify-between border-t border-brand-200 pt-3 text-sm">
              <span className="text-ink/70">{t('stitchingTotal')}</span>
              <span className="text-base font-semibold text-brand-800">
                {formatMoney(fee, locale)}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** SINGLE groups replace their answer; MULTI groups toggle it. */
function toggleOption(
  current: string[],
  group: StitchingOptionGroup,
  optionId: string,
): string[] {
  const groupOptionIds = new Set(group.options.map((option) => option.id));

  if (group.selectionType === 'SINGLE') {
    return [...current.filter((id) => !groupOptionIds.has(id)), optionId];
  }

  return current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
}

function Group({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'rounded-md border px-3 py-1.5 text-sm transition-colors duration-200',
        selected
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-sand-300 bg-white text-ink hover:border-brand-400',
      )}
    >
      {children}
    </button>
  );
}
