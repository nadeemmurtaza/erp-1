'use client';

type GridCols = 1 | 2 | 3;

interface GridToggleProps {
  value: GridCols;
  onChange: (cols: GridCols) => void;
}

const GRID_OPTIONS: { cols: GridCols; label: string }[] = [
  { cols: 1, label: '1' },
  { cols: 2, label: '2' },
  { cols: 3, label: '3' },
];

export function GridToggle({ value, onChange }: GridToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-noir-200 p-1">
      {GRID_OPTIONS.map((option) => (
        <button
          key={option.cols}
          onClick={() => onChange(option.cols)}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
            value === option.cols
              ? 'bg-noir-900 text-white'
              : 'text-noir-500 hover:bg-noir-50 hover:text-noir-900'
          }`}
          aria-label={`Show ${option.cols} columns`}
          title={`${option.cols} column${option.cols > 1 ? 's' : ''}`}
        >
          <div className="flex gap-0.5">
            {Array.from({ length: option.cols }).map((_, i) => (
              <div key={i} className="h-1 w-1 rounded-full bg-current" />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
