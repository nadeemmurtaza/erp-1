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
    <div className="flex items-center gap-1 border border-sand-300 rounded-md p-1">
      {GRID_OPTIONS.map((option) => (
        <button
          key={option.cols}
          onClick={() => onChange(option.cols)}
          className={`flex items-center justify-center w-8 h-8 rounded transition-all ${
            value === option.cols
              ? 'bg-brand-600 text-white'
              : 'hover:bg-sand-100 text-ink/60'
          }`}
          aria-label={`Show ${option.cols} columns`}
          title={`${option.cols} column${option.cols > 1 ? 's' : ''}`}
        >
          <div className="flex gap-0.5">
            {Array.from({ length: option.cols }).map((_, i) => (
              <div
                key={i}
                className="bg-current w-1 h-1 rounded-full"
              />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
