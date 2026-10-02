'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import {
  computeFabricEstimate,
  computeStitchingFee,
  formatMoney,
  validateMeasurements,
  type Locale,
} from '@newax/shared';
import { request as apiRequest } from '@/lib/api-client';
import type { StorefrontProduct } from '@/types/api';
import { getCustomerToken } from '@/lib/cart-client';
import type {
  MeasurementProfileSummary,
  StitchingGarment,
  StitchingOptionGroup,
} from '@/types/cart';

export interface StitchingSelection {
  /** The garment being made. Always sent: it is what makes the line a stitched one. */
  garmentTypeId: string;
  /** A premium STITCHING_SERVICE product. Absent means the garment's own price applies. */
  stitchingServiceId?: string;
  /** Set only while the numbers are still exactly those of the picked saved set. */
  measurementProfileId?: string;
  /** Field key -> value, as typed into the panel. What a guest sends. */
  measurementValues?: Record<string, number>;
  /** Set only while the measurements still match the standard size they were prefilled from. */
  sizeToken?: string;
  optionIds: string[];
  /** Option group key -> the customer describing that design area in their own words. */
  customDesignText?: Record<string, string>;
  /** Name to save the typed measurements under. Handled in the browser, not by the cart. */
  saveProfileAs?: string;
  notes?: string;
}

/** The cart's stitching payload: the selection minus the parts only the browser acts on. */
export type CartStitchingRequest = Omit<StitchingSelection, 'saveProfileAs'>;

interface StitchingPanelProps {
  product: StorefrontProduct;
  services: StorefrontProduct[];
  onChange: (selection: StitchingSelection | null) => void;
}

/** Rendered in this order; anything else falls under "other". */
const DESIGN_AREAS = [
  'neck',
  'sleeves',
  'upper_front',
  'lower_front',
  'back',
  'trouser',
  'finishing',
  'bodice',
  'skirt_panel',
  'outerwear',
] as const;

type DesignArea = (typeof DESIGN_AREAS)[number];

const AREA_LABEL_KEYS: Record<DesignArea, string> = {
  neck: 'designArea.neck',
  sleeves: 'designArea.sleeves',
  upper_front: 'designArea.upperFront',
  lower_front: 'designArea.lowerFront',
  back: 'designArea.back',
  trouser: 'designArea.trouser',
  finishing: 'designArea.finishing',
  bodice: 'designArea.bodice',
  skirt_panel: 'designArea.skirtPanel',
  outerwear: 'designArea.outerwear',
};

/** A field counts as "length"/"sleeve"/"chest"/"hips" by key substring, since
 * exact keys vary per garment (see fabric-estimate.ts). Sleeve-length is
 * checked first so it isn't mistaken for the garment's own total length. */
function findMeasurementField(
  fields: StitchingGarment['fields'],
  ...substrings: string[]
) {
  return fields.find((field) =>
    substrings.every((part) => field.key.toLowerCase().includes(part)),
  );
}

/**
 * "Get it stitched": garment → service → design → measurements, with the price
 * moving as the customer chooses.
 *
 * The running total uses the same computeStitchingFee the API uses, so the
 * figure here is the figure charged — no second implementation to drift. The
 * same holds for the measurements: the shared validator decides what passes and
 * the copy below only says so in the customer's language.
 *
 * Nothing here needs an account. A guest types their measurements in; a saved
 * profile is a shortcut that fills the same boxes.
 */
export function StitchingPanel({ product, services, onChange }: StitchingPanelProps) {
  const t = useTranslations('stitching');
  const locale = useLocale() as Locale;

  const [enabled, setEnabled] = useState(false);
  const [garmentKey, setGarmentKey] = useState<string>(product.garmentTypes[0]?.key ?? '');
  const [serviceId, setServiceId] = useState<string>('');
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [profileId, setProfileId] = useState<string>('');
  // Kept as typed rather than as numbers, so a half-entered figure survives.
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Which standard size the boxes were last filled from, if any. Editing a box
  // afterward keeps this — the customer is fine-tuning that size, still worth
  // recording — but switching to a saved profile or back to a blank slate clears it.
  const [sizeToken, setSizeToken] = useState<string>('');
  const [wideWidth, setWideWidth] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileLabel, setProfileLabel] = useState('');
  const [notes, setNotes] = useState('');

  const [garments, setGarments] = useState<StitchingGarment[]>([]);
  const [profiles, setProfiles] = useState<MeasurementProfileSummary[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(getCustomerToken()));
  }, []);

  // One request carries the garments, their measurement fields, their option
  // groups and their stitching price — everything the panel prices from.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const token = getCustomerToken();

    void apiRequest<StitchingGarment[]>('/stitching/garments')
      .then((loaded) => {
        if (!cancelled) setGarments(loaded);
      })
      // The panel still works with an empty list — it just cannot offer
      // stitching — so a failure here stays quiet rather than blocking a
      // product page.
      .catch(() => undefined);

    if (token) {
      void apiRequest<MeasurementProfileSummary[]>('/measurements/profiles', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
        .then((loaded) => {
          if (!cancelled) setProfiles(loaded);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // A garment the fabric lists but that is not offered for stitching must not
  // be selectable, so the chips are the intersection of the two.
  const offered = useMemo(
    () =>
      product.garmentTypes.filter((option) =>
        garments.some((candidate) => candidate.key === option.key),
      ),
    [product.garmentTypes, garments],
  );

  useEffect(() => {
    const first = offered[0];
    if (!first) return;
    setGarmentKey((current) =>
      offered.some((option) => option.key === current) ? current : first.key,
    );
  }, [offered]);

  const garment = useMemo(
    () => garments.find((candidate) => candidate.key === garmentKey) ?? null,
    [garments, garmentKey],
  );

  // Everything the customer filled in belongs to one garment; changing it
  // starts again rather than carrying another garment's answers across.
  useEffect(() => {
    if (!garment) return;

    setOptionIds(
      garment.optionGroups
        .filter((group) => group.required)
        .flatMap((group) => {
          // Start in the cheapest valid state rather than in an error.
          const cheapest =
            group.options.find((option) => option.priceDelta === 0) ?? group.options[0];
          return cheapest ? [cheapest.id] : [];
        }),
    );
    setCustomText({});
    setProfileId('');
    setValues({});
    setTouched({});
    setSizeToken('');
    setSaveProfile(false);
    setProfileLabel('');
  }, [garment]);

  const applicableServices = useMemo(
    () =>
      services.filter((service) =>
        garment ? service.serviceGarment?.key === garment.key : false,
      ),
    [services, garment],
  );

  useEffect(() => {
    setServiceId((current) =>
      applicableServices.some((service) => service.id === current) ? current : '',
    );
  }, [applicableServices]);

  const service = applicableServices.find((candidate) => candidate.id === serviceId);

  const fields = useMemo(() => garment?.fields ?? [], [garment]);

  const measurementValues = useMemo(() => {
    const parsed: Record<string, number> = {};

    for (const field of fields) {
      const raw = values[field.key];
      if (raw === undefined || raw.trim() === '') continue;

      const value = Number(raw);
      if (Number.isFinite(value)) parsed[field.key] = value;
    }

    return parsed;
  }, [fields, values]);

  const { valid: measurementsValid, byField: measurementErrors } = useMemo(() => {
    const check = validateMeasurements(fields, measurementValues);
    const byField: Record<string, string> = {};

    for (const issue of check.errors) {
      const field = fields.find((candidate) => candidate.key === issue.field);
      if (!field) continue;

      byField[field.key] =
        measurementValues[field.key] === undefined
          ? t('measurementRequired')
          : t('measurementRange', {
              min: field.min,
              max: field.max,
              unit: field.unit === 'CM' ? 'cm' : 'in',
            });
    }

    return { valid: check.valid, byField };
  }, [fields, measurementValues, t]);

  const matchingProfiles = useMemo(
    () => profiles.filter((profile) => profile.garmentType.key === garmentKey),
    [profiles, garmentKey],
  );

  // The saved set stays attached only while the numbers are still its own; once
  // the customer edits one, the line carries what they typed instead. The API
  // takes one or the other, never both.
  const profileMatches = useMemo(() => {
    const profile = matchingProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) return false;

    const keys = Object.keys(profile.values);
    return (
      keys.length === Object.keys(measurementValues).length &&
      keys.every((key) => profile.values[key] === measurementValues[key])
    );
  }, [matchingProfiles, profileId, measurementValues]);

  // Sleeve length is checked ahead of the garment's own length so a key like
  // "sleeve_length" isn't mistaken for the total-length field.
  const lengthField = useMemo(
    () => findMeasurementField(fields.filter((field) => !field.key.toLowerCase().includes('sleeve')), 'length'),
    [fields],
  );
  // Only a field that is both "sleeve" and "length" counts — a bare "sleeve"
  // match could just as easily be a width like sleeve_opening, which the
  // shirt formula would misread as a length.
  const sleeveField = useMemo(() => findMeasurementField(fields, 'sleeve', 'length'), [fields]);
  // Exact keys, unlike length/sleeve — "chest" and "hips" are stable across the
  // seeded garments, and a substring match risks catching an unrelated field
  // such as a "hip contour depth" on garments with a fuller schema.
  const chestField = useMemo(() => fields.find((field) => field.key.toLowerCase() === 'chest'), [fields]);
  const hipsField = useMemo(() => fields.find((field) => field.key.toLowerCase() === 'hips'), [fields]);

  const lengthInches = lengthField ? measurementValues[lengthField.key] : undefined;
  const sleeveLengthInches = sleeveField ? measurementValues[sleeveField.key] : undefined;
  const chestInches = chestField ? measurementValues[chestField.key] : undefined;
  const hipsInches = hipsField ? measurementValues[hipsField.key] : undefined;

  // Only worth showing once there is something to estimate from: either the
  // garment's flat PDF benchmark, or a length and a sleeve length typed in.
  const fabricEstimate = useMemo(() => {
    if (!garment) return null;
    if (garment.baseFabricGaz === null && (lengthInches === undefined || sleeveLengthInches === undefined)) {
      return null;
    }

    return computeFabricEstimate({
      garmentBaseGaz: garment.baseFabricGaz,
      lengthInches,
      sleeveLengthInches,
      chestInches,
      hipsInches,
      fabricType: product.fabric,
      wideWidth,
    });
  }, [garment, lengthInches, sleeveLengthInches, chestInches, hipsInches, product.fabric, wideWidth]);

  // computeFabricEstimate reports its extra-fabric reasons as fixed English
  // sentences (see fabric-estimate.ts) rather than codes, so the two that can
  // fire here are told apart by a stable fragment of their own wording.
  const fabricWarnings = fabricEstimate?.warnings ?? [];
  const showPlusSizeNote = fabricWarnings.some((warning) => warning.includes('cross-width'));
  const showShrinkNote = fabricWarnings.some((warning) => warning.toLowerCase().includes('shrink'));

  const fabricShortfall =
    fabricEstimate && product.fabricMeters !== null && fabricEstimate.estimatedMetres > product.fabricMeters
      ? Math.round((fabricEstimate.estimatedMetres - product.fabricMeters) * 100) / 100
      : null;

  const areaSections = useMemo(() => {
    const groups = garment?.optionGroups ?? [];
    const known = new Set<string>(DESIGN_AREAS);

    const sections = DESIGN_AREAS.map((area) => ({
      area: area as string,
      labelKey: AREA_LABEL_KEYS[area],
      groups: groups.filter((group) => group.area === area),
    }));

    sections.push({
      area: 'other',
      labelKey: 'designArea.other',
      groups: groups.filter((group) => !group.area || !known.has(group.area)),
    });

    return sections.filter((section) => section.groups.length > 0);
  }, [garment]);

  const optionsComplete = useMemo(
    () =>
      (garment?.optionGroups ?? []).every(
        (group) =>
          !group.required || group.options.some((option) => optionIds.includes(option.id)),
      ),
    [garment, optionIds],
  );

  const chosenOptions = useMemo(
    () =>
      (garment?.optionGroups ?? []).flatMap((group) =>
        group.options.filter((option) => optionIds.includes(option.id)),
      ),
    [garment, optionIds],
  );

  const customDesignText = useMemo(() => {
    const cleaned: Record<string, string> = {};

    for (const [key, text] of Object.entries(customText)) {
      const trimmed = text.trim();
      if (trimmed) cleaned[key] = trimmed;
    }

    return cleaned;
  }, [customText]);

  // A premium service overrides the garment's own price; without one the
  // garment is what the make-up costs.
  const baseFee = service?.basePrice ?? garment?.stitchingPrice ?? 0;
  const optionsTotal = chosenOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  const fee = computeStitchingFee({
    baseFee,
    optionDeltas: chosenOptions.map((option) => option.priceDelta),
  });

  // Publish the selection upward whenever any part of it changes. An incomplete
  // or out-of-range panel publishes nothing, so the cart is never sent a line
  // the API would refuse.
  useEffect(() => {
    if (!enabled || !garment || !measurementsValid || !optionsComplete) {
      onChange(null);
      return;
    }

    const label = profileLabel.trim();

    onChange({
      garmentTypeId: garment.id,
      stitchingServiceId: service?.id,
      measurementProfileId: profileMatches ? profileId : undefined,
      measurementValues: profileMatches ? undefined : measurementValues,
      optionIds,
      customDesignText:
        Object.keys(customDesignText).length > 0 ? customDesignText : undefined,
      sizeToken: sizeToken || undefined,
      saveProfileAs: signedIn && saveProfile && label ? label : undefined,
      notes: notes.trim() || undefined,
    });
  }, [
    enabled,
    garment,
    measurementsValid,
    optionsComplete,
    service,
    profileMatches,
    profileId,
    measurementValues,
    optionIds,
    customDesignText,
    sizeToken,
    signedIn,
    saveProfile,
    profileLabel,
    notes,
    onChange,
  ]);

  if (!product.stitchingAvailable || product.garmentTypes.length === 0) {
    return null;
  }

  const garmentLabel = garment ? (locale === 'ur' ? garment.labelUr : garment.labelEn) : '';

  function pickProfile(id: string) {
    setProfileId(id);
    setTouched({});
    // A saved set and a standard size are two different ways to prefill the
    // same boxes; picking one retires the other rather than stacking.
    setSizeToken('');

    const profile = matchingProfiles.find((candidate) => candidate.id === id);
    // "Or type them in" clears the prefill; a saved set fills the same boxes,
    // which the customer is then free to edit.
    setValues(
      profile
        ? Object.fromEntries(
            Object.entries(profile.values).map(([key, value]) => [key, String(value)]),
          )
        : {},
    );
  }

  function pickSize(token: string) {
    const row = garment?.sizeChart.find((candidate) => candidate.sizeToken === token);
    if (!row) return;

    setSizeToken(token);
    setProfileId('');
    setTouched({});
    setValues(
      Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, String(value)])),
    );
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 field-check"
        />
        <span>
          <span className="block text-sm font-semibold text-neutral-900">{t('getStitched')}</span>
          <span className="block text-sm text-neutral-500">{t('explainer')}</span>
        </span>
      </label>

      <div className={cn(
        'overflow-hidden transition-[max-height,opacity] duration-slow',
        enabled ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
          {offered.length > 1 ? (
            <Group label={t('garment')}>
              <div className="flex flex-wrap gap-2">
                {offered.map((option) => (
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

          {applicableServices.length > 0 && garment ? (
            <Group label={t('service')}>
              <div className="space-y-2">
                <ServiceChoice
                  name={t('baseStitchingFee')}
                  price={garment.stitchingPrice}
                  locale={locale}
                  selected={serviceId === ''}
                  onSelect={() => setServiceId('')}
                />
                {applicableServices.map((option) => (
                  <ServiceChoice
                    key={option.id}
                    name={option.name}
                    description={option.description}
                    price={option.basePrice}
                    locale={locale}
                    selected={option.id === serviceId}
                    onSelect={() => setServiceId(option.id)}
                  />
                ))}
              </div>
            </Group>
          ) : null}

          {areaSections.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-neutral-900">{t('designAreas')}</p>

              {areaSections.map((section) => (
                <Group key={section.area} label={t(section.labelKey)}>
                  <div className="space-y-3">
                    {section.groups.map((group) => (
                      <OptionGroupRow
                        key={group.id}
                        group={group}
                        locale={locale}
                        optionIds={optionIds}
                        customText={customText[group.key] ?? ''}
                        customDesignLabel={t('customDesign')}
                        customDesignPlaceholder={t('customDesignPlaceholder')}
                        onToggle={(optionId) =>
                          setOptionIds((current) => toggleOption(current, group, optionId))
                        }
                        onCustomText={(text) =>
                          setCustomText((current) => ({ ...current, [group.key]: text }))
                        }
                      />
                    ))}
                  </div>
                </Group>
              ))}
            </div>
          ) : null}

          {garment ? (
            <Group
              label={
                offered.length > 1
                  ? t('measurementsFor', { garment: garmentLabel })
                  : t('enterMeasurements')
              }
              required
            >
              {signedIn && matchingProfiles.length > 0 ? (
                <label className="block">
                  <span className="field-label">{t('useSavedProfile')}</span>
                  <select
                    value={profileId}
                    onChange={(event) => pickProfile(event.target.value)}
                    className="field-input max-w-sm"
                  >
                    <option value="">{t('orEnterManually')}</option>
                    {matchingProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {garment.sizeChart.length > 0 ? (
                <div className="mt-2">
                  <p className="field-label">{t('useStandardSize')}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{t('standardSizeHint')}</p>
                  <div
                    role="group"
                    aria-label={t('useStandardSize')}
                    className="mt-1.5 flex flex-wrap gap-2"
                  >
                    {garment.sizeChart.map((row) => (
                      <Chip
                        key={row.sizeToken}
                        selected={sizeToken === row.sizeToken}
                        onClick={() => pickSize(row.sizeToken)}
                      >
                        {t(`size${row.sizeToken}`)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((field) => {
                  const error = touched[field.key] ? measurementErrors[field.key] : undefined;

                  return (
                    <label key={field.id} className="block text-sm">
                      <span className="text-neutral-500">
                        {locale === 'ur' ? field.labelUr : field.labelEn}
                        {field.required ? <span className="text-red-600"> *</span> : null}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={0.25}
                        min={field.min}
                        max={field.max}
                        required={field.required}
                        aria-invalid={error ? true : undefined}
                        value={values[field.key] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        onBlur={() =>
                          setTouched((current) => ({ ...current, [field.key]: true }))
                        }
                        className="field-input"
                      />
                      <span
                        className={cn(
                          'block text-xs',
                          error ? 'text-red-700' : 'text-neutral-400',
                        )}
                      >
                        {error ??
                          t('measurementRange', {
                            min: field.min,
                            max: field.max,
                            unit: field.unit === 'CM' ? 'cm' : 'in',
                          })}
                      </span>
                    </label>
                  );
                })}
              </div>

              {signedIn && (
                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-500">
                    <input
                      type="checkbox"
                      checked={saveProfile}
                      onChange={(event) => setSaveProfile(event.target.checked)}
                      className="field-check"
                    />
                    {t('saveAsProfile')}
                  </label>

                  {saveProfile ? (
                    <input
                      value={profileLabel}
                      onChange={(event) => setProfileLabel(event.target.value)}
                      maxLength={60}
                      aria-label={t('saveAsProfile')}
                      placeholder={t('profileLabelPlaceholder')}
                      className="field-input max-w-sm"
                    />
                  ) : null}
                </div>
              )}
            </Group>
          ) : null}

          {fabricEstimate ? (
            <div className="rounded-md bg-white/70 p-3">
              <p className="text-sm font-semibold text-neutral-900">{t('fabricEstimate')}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{t('fabricEstimateBody')}</p>

              <p className="mt-1.5 text-sm font-medium text-neutral-900">
                {t('fabricEstimateValue', { metres: fabricEstimate.estimatedMetres })}
              </p>

              {product.fabricMeters !== null ? (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {t('fabricIncluded', { metres: product.fabricMeters })}
                </p>
              ) : null}

              {fabricShortfall !== null ? (
                <p className="mt-0.5 text-xs text-red-700">
                  {t('fabricShort', { metres: fabricShortfall })}
                </p>
              ) : null}

              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={wideWidth}
                  onChange={(event) => setWideWidth(event.target.checked)}
                  className="field-check"
                />
                {t('fabricWideWidth')}
              </label>

              {showPlusSizeNote ? (
                <p className="mt-1 text-xs text-neutral-400">{t('fabricPlusSizeNote')}</p>
              ) : null}
              {showShrinkNote ? (
                <p className="mt-1 text-xs text-neutral-400">{t('fabricShrinkNote')}</p>
              ) : null}
            </div>
          ) : null}

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

          {garment ? (
            <div className="space-y-1 border-t border-neutral-100 pt-3 text-sm">
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-neutral-500">{t('baseStitchingFee')}</span>
                <span className="text-neutral-900">{formatMoney(baseFee, locale)}</span>
              </p>

              {optionsTotal !== 0 ? (
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-neutral-500">{t('optionsTotal')}</span>
                  <span className="text-neutral-900">
                    {optionsTotal > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(optionsTotal), locale)}
                  </span>
                </p>
              ) : null}

              <p className="flex items-baseline justify-between gap-3 pt-1">
                <span className="font-medium text-neutral-900">{t('garmentSubtotal')}</span>
                <span className="text-base font-semibold text-neutral-900">
                  {formatMoney(fee, locale)}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Saves the typed measurements as a reusable profile, then hands back what the
 * cart accepts.
 *
 * The cart request has no field for the name, so the profile is a separate call
 * made at add time. It is allowed to fail quietly: losing a saved set is a much
 * smaller harm than losing the line the customer has just built.
 */
export async function prepareStitching(
  selection: StitchingSelection,
): Promise<CartStitchingRequest> {
  const { saveProfileAs, ...request } = selection;
  const token = getCustomerToken();

  if (saveProfileAs && token && selection.measurementValues) {
    // Saving the profile is a convenience on top of adding to cart; if it
    // fails the customer still gets their item, so this swallows rather than
    // surfacing.
    await apiRequest('/measurements/profiles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      expect: 'none',
      body: {
        label: saveProfileAs,
        garmentTypeId: selection.garmentTypeId,
        values: selection.measurementValues,
      },
    }).catch(() => undefined);
  }

  return request;
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

function OptionGroupRow({
  group,
  locale,
  optionIds,
  customText,
  customDesignLabel,
  customDesignPlaceholder,
  onToggle,
  onCustomText,
}: {
  group: StitchingOptionGroup;
  locale: Locale;
  optionIds: string[];
  customText: string;
  customDesignLabel: string;
  customDesignPlaceholder: string;
  onToggle: (optionId: string) => void;
  onCustomText: (text: string) => void;
}) {
  const label = locale === 'ur' ? group.labelUr : group.labelEn;
  const help = locale === 'ur' ? group.helpUr : group.helpEn;

  return (
    <div>
      <p className="text-sm font-medium text-neutral-900">
        {label}
        {group.required ? <span className="text-red-600"> *</span> : null}
      </p>

      {help ? <p className="mt-0.5 text-xs text-neutral-400">{help}</p> : null}

      <div role="group" aria-label={label} className="mt-1.5 flex flex-wrap gap-2">
        {group.options.map((option) => (
          <Chip
            key={option.id}
            selected={optionIds.includes(option.id)}
            onClick={() => onToggle(option.id)}
          >
            {locale === 'ur' ? option.labelUr : option.labelEn}
            {option.priceDelta !== 0 ? (
              <span className="ms-1 text-xs opacity-80">
                {option.priceDelta > 0 ? '+' : '−'}
                {formatMoney(Math.abs(option.priceDelta), locale)}
              </span>
            ) : null}
          </Chip>
        ))}
      </div>

      {group.allowCustomText ? (
        <label className="mt-2 block">
          <span className="text-xs text-neutral-500">{customDesignLabel}</span>
          <textarea
            value={customText}
            onChange={(event) => onCustomText(event.target.value)}
            onBlur={() => onCustomText(customText.trim())}
            rows={2}
            maxLength={500}
            placeholder={customDesignPlaceholder}
            className="field-input"
          />
        </label>
      ) : null}
    </div>
  );
}

function ServiceChoice({
  name,
  description,
  price,
  locale,
  selected,
  onSelect,
}: {
  name: string;
  description?: string | null;
  price: number;
  locale: Locale;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-normal',
        selected ? 'border-neutral-900 bg-white' : 'border-neutral-100 bg-white/60 hover:border-neutral-400',
      )}
    >
      <input
        type="radio"
        name="stitching-service"
        checked={selected}
        onChange={onSelect}
        className="mt-1 field-check"
      />
      <span className="flex-1">
        <span className="flex justify-between gap-3">
          <span className="text-sm font-medium text-neutral-900">{name}</span>
          <span className="text-sm font-medium text-neutral-900">{formatMoney(price, locale)}</span>
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>
        ) : null}
      </span>
    </label>
  );
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
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
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
      className={cn('chip', selected ? 'chip-selected' : 'chip-unselected')}
    >
      {children}
    </button>
  );
}
