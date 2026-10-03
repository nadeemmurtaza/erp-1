'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/cn';
import type { StitchingGarment } from '@/types/cart';
import type { Locale } from '@newax/shared';

interface SizeChartModalProps {
  productName: string;
  garments: StitchingGarment[];
  locale: Locale;
}

export function SizeChartModal({ productName, garments, locale }: SizeChartModalProps) {
  const t = useTranslations('product');
  const [open, setOpen] = useState(false);

  // The modal needs to lock body scroll. We use the same pattern as admin-shell.tsx.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Handle Escape key to close the modal
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus trap and return focus
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && modalRef.current) {
      modalRef.current.focus();
    } else if (!open && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  // Filter garments that actually have a non-empty size chart
  const validGarments = useMemo(() => {
    return garments.filter(g => g.sizeChart && g.sizeChart.length > 0);
  }, [garments]);

  const [activeGarmentIndex, setActiveGarmentIndex] = useState(0);

  if (validGarments.length === 0) return null;

  const activeGarment = validGarments[activeGarmentIndex];

  // Determine the primary unit to show. If all fields have the same unit, show it once.
  // Otherwise, we'll display it per row.
  // Only the fields somebody has actually filled in. A row that reads "—" for
  // every size is noise, and it made the chart twice as tall as its content:
  // the seeded kameez carries twelve fields and figures for seven.
  const chartedFields = activeGarment.fields.filter((field) =>
    activeGarment.sizeChart.some((row) => typeof row.values[field.key] === 'number'),
  );

  const units = new Set(activeGarment.fields.map(f => f.unit));
  const sameUnit = units.size === 1 ? Array.from(units)[0] : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-900"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.3 15.3l-2.6-2.6a1 1 0 0 0-1.4 0l-12 12a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l12-12a1 1 0 0 0 0-1.4z" />
          <path d="M14.5 11.5l2 2" />
          <path d="M11 15l2 2" />
          <path d="M7.5 18.5l2 2" />
        </svg>
        <span className="underline underline-offset-4">{t('sizeChart')}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="size-chart-title">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-scrim/40 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <div
            ref={modalRef}
            tabIndex={-1}
            className="card relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-overlay shadow-modal outline-none"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-neutral-100 p-4 sm:p-6">
              <div>
                <h2 id="size-chart-title" className="font-display text-lg font-medium text-neutral-900">
                  {productName}
                </h2>
                <p className="text-sm text-neutral-500">{t('sizeCharts')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 transition-colors"
                aria-label={t('close')}
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-4 sm:p-6">
              {validGarments.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {validGarments.map((g, idx) => {
                    const label = locale === 'ur' ? g.labelUr : g.labelEn;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setActiveGarmentIndex(idx)}
                        className={cn(
                          'chip',
                          activeGarmentIndex === idx
                            ? 'chip-selected'
                            : 'chip-unselected'
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {sameUnit && (
                <p className="mb-2 text-xs text-neutral-500">
                  {t('measurementsIn', { unit: t(sameUnit.toLowerCase()) })}
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-full whitespace-nowrap text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th
                        scope="col"
                        // Sticky to match the row labels below it. Without this the
                        // corner cell scrolls away while they stay put, and every
                        // size header ends up over the wrong column — the chart then
                        // reads as if XS and S have no measurements at all.
                        className="sticky start-0 bg-white px-2.5 py-1.5 font-semibold text-neutral-900"
                      >
                        {/* Empty top-left cell */}
                      </th>
                      {activeGarment.sizeChart.map((col) => (
                        <th key={col.sizeToken} scope="col" className="px-2.5 py-1.5 text-center font-semibold text-neutral-900">
                          {t(`size${col.sizeToken}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {chartedFields.map((field) => (
                      <tr key={field.key} className="hover:bg-neutral-50 transition-colors">
                        <th scope="row" className="sticky start-0 bg-white px-2.5 py-1.5 font-medium text-neutral-900 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] rtl:shadow-[-1px_0_0_0_rgba(0,0,0,0.1)]">
                          {locale === 'ur' ? field.labelUr : field.labelEn}
                          {!sameUnit && <span className="ms-1 text-neutral-400 font-normal">({t(field.unit.toLowerCase())})</span>}
                        </th>
                        {activeGarment.sizeChart.map((col) => {
                          const val = col.values[field.key];
                          return (
                            <td key={col.sizeToken} className="px-2.5 py-1.5 text-center tabular-nums text-neutral-700">
                              {typeof val === 'number' ? val : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
