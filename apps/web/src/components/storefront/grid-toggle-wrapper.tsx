'use client';

import { GridToggle } from './grid-toggle';

interface GridToggleWrapperProps {
  value: 1 | 2 | 3;
  onChange: (cols: 1 | 2 | 3) => void;
}

export function GridToggleWrapper({ value, onChange }: GridToggleWrapperProps) {
  return <GridToggle value={value} onChange={onChange} />;
}
