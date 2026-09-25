import Link from 'next/link';
import { Section } from '@/components/ui';
import { DataTable } from '@/components/ui';
import { formatValue } from '@/components/admin/dashboard/metric-card';
import { resolvePath, interpolateHref } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type TableBlockConfig = Extract<ReportBlock, { kind: 'table' }>;

/** The one table every report with rows-of-facts reaches for — a thin config over `<DataTable>`, the admin's own one table. */
export function TableBlock({ config, data }: { config: TableBlockConfig; data: unknown }) {
  const rows = resolvePath(data, config.path);
  const tableRows = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];

  return (
    <Section title={config.title}>
      <DataTable
        rows={tableRows}
        rowKey={(row, index) => String(resolvePath(row, config.columns[0]?.key ?? '') ?? index)}
        emptyLabel="No data in this window."
        columns={config.columns.map((column) => ({
          header: column.header,
          align: column.align === 'right' ? 'end' : 'start',
          numeric: column.format === 'integer' || column.format === 'money' || column.format === 'days' || column.format === 'percent' || column.format === 'percent-bps',
          cell: (row: Record<string, unknown>) => {
            const value = resolvePath(row, column.key);
            const text = column.format === 'text' ? String(value ?? '—') : formatValue(column.format, Number(value ?? 0));
            return column.href ? <Link href={interpolateHref(column.href, row)}>{text}</Link> : text;
          },
        }))}
      />
    </Section>
  );
}
