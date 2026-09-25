import { SURFACE } from './chart-theme';

/**
 * A per-series marker shape — the third channel (with colour and dash
 * pattern) that keeps a multi-series chart readable in greyscale (WO-A.2).
 * Recharts' `dot` prop takes a render function returning an SVG element.
 */
export function ChartMarker({
  cx,
  cy,
  shape,
  color,
  size = 4,
}: {
  cx: number;
  cy: number;
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star';
  color: string;
  size?: number;
}) {
  const common = { fill: color, stroke: SURFACE, strokeWidth: 1.5 };

  switch (shape) {
    case 'square':
      return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} {...common} />;
    case 'triangle':
      return (
        <polygon
          points={`${cx},${cy - size * 1.2} ${cx - size * 1.1},${cy + size} ${cx + size * 1.1},${cy + size}`}
          {...common}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${cx},${cy - size * 1.3} ${cx + size * 1.3},${cy} ${cx},${cy + size * 1.3} ${cx - size * 1.3},${cy}`}
          {...common}
        />
      );
    case 'cross':
      return (
        <g stroke={color} strokeWidth={2}>
          <line x1={cx - size} y1={cy - size} x2={cx + size} y2={cy + size} />
          <line x1={cx - size} y1={cy + size} x2={cx + size} y2={cy - size} />
        </g>
      );
    case 'star': {
      const points = Array.from({ length: 5 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        return `${cx + Math.cos(angle) * size * 1.3},${cy + Math.sin(angle) * size * 1.3}`;
      }).join(' ');
      return <polygon points={points} {...common} />;
    }
    case 'circle':
    default:
      return <circle cx={cx} cy={cy} r={size} {...common} />;
  }
}
