'use client';

import { useState } from 'react';
import { GridToggle } from './grid-toggle';

export function GridToggleWrapper() {
  const [gridCols, setGridCols] = useState<1 | 2 | 3>(3);

  return <GridToggle value={gridCols} onChange={setGridCols} />;
}
