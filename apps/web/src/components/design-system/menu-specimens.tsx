'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { BRAND, DEFAULT_LOCALE, SHOP_TIME_ZONE, intlTag } from '@newax/shared';
import { isoInZone } from '@/lib/calendar';
import { DateField } from '@/components/ui/date-field';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select, type SelectOption } from '@/components/ui/select';
import { Group } from './foundations';

/** Option lists for the demos. Branch names are built from the deployment's own regions, so nothing here names a place. */
const REGIONS = BRAND.locale.regions;

const STATUS: readonly SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'draft', label: 'Draft' },
];

const CHANNELS: readonly SelectOption[] = [
  'Online store',
  'Point of sale',
  'Wholesale',
  'Marketplace',
  'Phone orders',
  'Events',
  'Catalogue',
  'Partners',
].map((label) => ({ value: label.toLowerCase().replace(/\s+/g, '-'), label }));

/** 140 branches: the case MNU-1 names, where scrolling to one is the failure. */
function branches(): SelectOption[] {
  return Array.from({ length: 140 }, (_, i) => {
    const region = REGIONS[i % REGIONS.length]!;
    return { value: `branch-${i + 1}`, label: `${region} · Branch ${String(i + 1).padStart(3, '0')}` };
  });
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentedSpecimen() {
  const [value, setValue] = useState('active');
  return (
    <Field id="menu-seg" label="Status">
      <Select id="menu-seg" label="Status" options={STATUS} value={value} onChange={setValue} />
    </Field>
  );
}

function PlainMenuSpecimen() {
  const [value, setValue] = useState('');
  return (
    <Field id="menu-plain" label="Sales channel">
      <Select
        id="menu-plain"
        label="Sales channel"
        options={CHANNELS}
        value={value}
        onChange={setValue}
        placeholder="Choose a channel"
      />
    </Field>
  );
}

function SearchSpecimen() {
  const options = useMemo(branches, []);
  const [value, setValue] = useState('');
  return (
    <Field id="menu-search" label="Branch">
      <Select
        id="menu-search"
        label="Branch"
        options={options}
        value={value}
        onChange={setValue}
        placeholder="Choose a branch"
      />
    </Field>
  );
}

/**
 * MNU-5. Archived stays in the list and says why; Finance carries the action that clears the
 * reason, and running it makes the option choosable, so the specimen shows the whole round trip.
 */
function ReasonsSpecimen() {
  const [financeOn, setFinanceOn] = useState(false);
  const [menu, setMenu] = useState('');
  const [smsOn, setSmsOn] = useState(false);
  const [seg, setSeg] = useState('print');

  const options: SelectOption[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    { value: 'bank', label: 'Bank transfer' },
    { value: 'cheque', label: 'Cheque', disabled: { reason: 'Cheques were turned off for this branch' } },
    {
      value: 'ledger',
      label: 'On account',
      ...(financeOn
        ? {}
        : {
            disabled: {
              reason: 'Needs the Finance module',
              action: { label: 'Enable', onSelect: () => setFinanceOn(true) },
            },
          }),
    },
    { value: 'voucher', label: 'Voucher', disabled: { reason: 'Vouchers need a manager’s approval first' } },
  ];

  return (
    <div className="grid min-w-0 gap-6 sm:grid-cols-2">
      <Field id="menu-reasons" label="Payment method">
        <Select
          id="menu-reasons"
          label="Payment method"
          options={options}
          value={menu}
          onChange={setMenu}
          placeholder="Choose a method"
        />
      </Field>
      <Field id="menu-reasons-seg" label="Receipt">
        <Select
          id="menu-reasons-seg"
          label="Receipt"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'print', label: 'Print' },
            { value: 'email', label: 'Email' },
            {
              value: 'sms',
              label: 'Text message',
              ...(smsOn
                ? {}
                : {
                    disabled: {
                      reason: 'Needs a text-message provider',
                      action: { label: 'Set up', onSelect: () => setSmsOn(true) },
                    },
                  }),
            },
          ]}
        />
      </Field>
    </div>
  );
}

function MultiSpecimen() {
  const [values, setValues] = useState<string[]>(['online-store']);
  const [many, setMany] = useState<string[]>([]);
  const options = useMemo(branches, []);
  return (
    <div className="grid min-w-0 gap-6 sm:grid-cols-2">
      <Field id="menu-multi" label="Sales channels">
        <MultiSelect
          id="menu-multi"
          label="Sales channels"
          options={CHANNELS}
          values={values}
          onChange={setValues}
          placeholder="Choose channels"
        />
      </Field>
      <Field id="menu-multi-search" label="Branches">
        <MultiSelect
          id="menu-multi-search"
          label="Branches"
          options={options}
          values={many}
          onChange={setMany}
          placeholder="Choose branches"
        />
      </Field>
    </div>
  );
}

function DateSpecimen() {
  const [due, setDue] = useState('');
  const [born, setBorn] = useState('');
  // The latest a birth date can be: today, in the shop's day, read once when the specimen mounts.
  const [today] = useState(() => isoInZone(new Date(), SHOP_TIME_ZONE, intlTag(DEFAULT_LOCALE)));
  return (
    <div className="grid min-w-0 gap-6 sm:grid-cols-2">
      <Field id="menu-due" label="Due date">
        <DateField id="menu-due" value={due} onChange={setDue} aria-describedby="menu-due-note" />
        <p id="menu-due-note" className="mt-1 text-sm text-neutral-900/70">
          Try 3 Oct, tomorrow, +7d or 3/10/26. Then open the calendar and jump by year.
        </p>
      </Field>
      <Field id="menu-born" label="Date of birth (not in the future)">
        <DateField id="menu-born" value={born} onChange={setBorn} max={today} min="1900-01-01" required />
      </Field>
    </div>
  );
}

/** A menu at the bottom of a short scroll box: it is not clipped by the box, and it opens upward. */
function FlipSpecimen() {
  const [value, setValue] = useState('');
  return (
    <div className="max-h-48 overflow-y-auto rounded bg-neutral-50 p-4">
      <p className="text-sm text-neutral-900/70">
        Scroll down in this box, then open the menu. It is not cut off by the box, and it opens upward when there is no
        room below.
      </p>
      <div className="h-40" aria-hidden="true" />
      <Field id="menu-flip" label="Sales channel">
        <Select
          id="menu-flip"
          label="Sales channel"
          options={CHANNELS}
          value={value}
          onChange={setValue}
          placeholder="Choose a channel"
        />
      </Field>
    </div>
  );
}

export function MenuSpecimens() {
  return (
    <>
      <Group
        title="Fewer than five: a segmented control (MNU-6)"
        note="Three options are one tap and nothing hidden. A call site hands Select its options and never chooses the control: the count does."
      >
        <SegmentedSpecimen />
      </Group>
      <Group
        title="Five to ten: a menu"
        note="Opens below its button, lifted out of whatever holds it. Arrow keys, Home, End and Page keys move; typing a letter jumps to it; Escape closes and puts focus back."
      >
        <PlainMenuSpecimen />
      </Group>
      <Group
        title="More than ten: search on top (MNU-1)"
        note="140 branches. The search field has focus when the list opens; typing narrows by words, ignoring case and accents. Nothing matching says so and offers to clear it."
      >
        <SearchSpecimen />
      </Group>
      <Group
        title="Reasons, not grey (MNU-5)"
        note="A choice that cannot be made stays in the list and says why, with the one action that clears it. Enable Finance and On account becomes choosable."
      >
        <ReasonsSpecimen />
      </Group>
      <Group
        title="Stay open on pick (MNU-3)"
        note="Checkboxes in a menu that stays open, a live count, and an explicit Done. Each pick is already saved; Done only closes."
      >
        <MultiSpecimen />
      </Group>
      <Group
        title="Typed dates (MNU-2)"
        note="A text field first: it reads what is typed, says the date it understood before committing, and keeps text it cannot read with a reason. The calendar has a month and year jump."
      >
        <DateSpecimen />
      </Group>
      <Group
        title="Collision-aware (MNU-4)"
        note="Placed against the room there is: below unless that is too small and above is bigger. Its height is capped to the room and it scrolls inside itself."
      >
        <FlipSpecimen />
      </Group>
    </>
  );
}
