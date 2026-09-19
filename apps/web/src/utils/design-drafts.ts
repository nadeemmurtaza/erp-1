import type { AdminStitchingOption, StitchingDesignArea } from '@/types/api';

/**
 * Design groups as form state.
 *
 * Shared once the list and the editor became separate routes: the list groups
 * by area and needs the labels, the editor drafts every field and needs the
 * conversions. Both have to agree on what "applies anywhere" means, which is
 * a null column on one side and an empty string on the other.
 */

export type DesignArea = Exclude<StitchingDesignArea, null>;

/**
 * The regions, ordered the way a tailor reads down a garment rather than
 * alphabetically — the list arrives sorted by the raw column value, which puts
 * "back" above "neck" and reads as noise to the person maintaining it. The
 * last three cover garment families the original seven don't fit — festive
 * blouses/cholis, lehenga/petticoat skirts, and abaya/kaftan outerwear — and
 * are ordered to match the storefront panel's area grouping.
 */
export const AREAS: ReadonlyArray<{ value: DesignArea; label: string }> = [
  { value: 'neck', label: 'Neck' },
  { value: 'sleeves', label: 'Sleeves' },
  { value: 'upper_front', label: 'Upper front' },
  { value: 'lower_front', label: 'Lower front' },
  { value: 'back', label: 'Back' },
  { value: 'trouser', label: 'Trouser' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'bodice', label: 'Bodice' },
  { value: 'skirt_panel', label: 'Skirt panel' },
  { value: 'outerwear', label: 'Outer layer' },
];

/** Groups with no area apply wherever the storefront chooses to show them. */
export const ANYWHERE = 'Applies anywhere';

export interface GroupDraft {
  labelEn: string;
  labelUr: string;
  /** Empty string is the form's spelling of a null area. */
  area: DesignArea | '';
  /** Empty string is the form's spelling of "every garment". */
  garmentTypeId: string;
  selectionType: 'SINGLE' | 'MULTI';
  required: boolean;
  allowCustomText: boolean;
  helpEn: string;
  helpUr: string;
  isActive: boolean;
}

export interface OptionDraft {
  /** Absent until the row has been saved once. */
  id?: string;
  key: string;
  labelEn: string;
  labelUr: string;
  /** Rupees, as typed. Converted to paisa on save — the API stores integer paisa. */
  priceDelta: string;
  imageUrl: string;
  isActive: boolean;
}

export function toOptionDraft(option: AdminStitchingOption): OptionDraft {
  return {
    id: option.id,
    key: option.key,
    labelEn: option.labelEn,
    labelUr: option.labelUr,
    priceDelta: String(option.priceDelta / 100),
    imageUrl: option.imageUrl ?? '',
    isActive: option.isActive,
  };
}

/** Rupees as typed to the integer paisa the API stores. Blank reads as free. */
export function toPaisa(rupees: string): number {
  const value = Number(rupees);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** An appended row the user never filled in — skipped rather than rejected. */
export function isBlankOption(option: OptionDraft): boolean {
  return option.key.trim() === '' && option.labelEn.trim() === '';
}

export function areaLabel(area: DesignArea | null): string {
  return AREAS.find((candidate) => candidate.value === area)?.label ?? ANYWHERE;
}
