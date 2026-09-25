/**
 * The screen-reader fallback every wrapper renders alongside its SVG (WO-A.2
 * acceptance: "a screen-reader-only table whose cells equal the plotted
 * values"). Visually hidden via the existing `sr-only` utility, not
 * `display: none` — a screen reader must still reach it.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<readonly (string | number)[]>;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
