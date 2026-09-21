'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';

export interface PartySearchResult {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  /** Set when this Party has a linked Supplier profile — what a SUPPLIER-role pick actually resolves to. */
  supplierId: string | null;
}

interface PartyPickerProps {
  /**
   * Which side of the trade to search.
   *
   * Named `partyRole`, not `role`: `role` on a JSX element is the ARIA
   * attribute, so a prop of that name both reads as one and is linted as one.
   */
  partyRole: 'SUPPLIER' | 'MANUFACTURER' | 'DISTRIBUTOR' | 'RETAILER';
  /** Set it to label the search field from outside — `<label htmlFor>`. */
  id?: string;
  /** The id the caller actually wants (e.g. Supplier.id for a SUPPLIER pick), not the Party id. */
  value: string;
  onSelect: (result: PartySearchResult) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Search-and-select for the permanent counterparty profile (Party), instead
 * of re-typing a name into a form or picking from a plain dropdown. First of
 * its kind in apps/web — the shape any future Retailer/Distributor/
 * Manufacturer or Quote/Invoice picker should reuse rather than reinventing
 * a free-text counterparty field.
 */
export function PartyPicker({ partyRole, id, value, onSelect, placeholder, className }: PartyPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PartySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    const timer = setTimeout(() => {
      adminFetch<{ data: PartySearchResult[] }>('/admin/parties/search', { query: { q: query || undefined, role: partyRole } })
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, partyRole, open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        className="field-input w-full"
        placeholder={placeholder ?? 'Search by name or phone...'}
        value={open ? query : selectedName}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => setQuery(event.target.value)}
      />
      {open ? (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-neutral-200 bg-white shadow-lg">
          {busy ? (
            <div className="p-3 text-sm text-neutral-900/60">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-neutral-900/60">No matches.</div>
          ) : (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                className={cn(
                  'block w-full px-3 py-2 text-start text-sm hover:bg-neutral-50',
                  (result.supplierId ?? result.id) === value && 'bg-neutral-50 font-medium',
                )}
                onClick={() => {
                  onSelect(result);
                  setSelectedName(result.name);
                  setOpen(false);
                }}
              >
                <div className="text-neutral-900">{result.name}</div>
                <div className="text-neutral-900/60">
                  {[result.phone, result.city].filter(Boolean).join(' — ') || 'No contact details'}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
