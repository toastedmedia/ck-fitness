/** Small dependency-free SVG charts. Colours come from the theme through CSS variables. */

export function LineChart({
  points,
  unit,
  label,
}: {
  points: { x: string; y: number }[];
  unit: string;
  label: string;
}) {
  if (points.length < 2) {
    return <p className="text-xs text-muted">Log one more weigh-in to see your trend.</p>;
  }
  const w = 300,
    h = 110,
    pad = 10;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys) - 0.5,
    max = Math.max(...ys) + 0.5;
  const X = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const Y = (v: number) => pad + ((max - v) / (max - min)) * (h - pad * 2 - 10);
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="w-full">
      {[0.25, 0.6, 0.95].map((g) => (
        <line
          key={g}
          x1={pad}
          x2={w - pad}
          y1={pad + g * (h - pad * 2 - 10)}
          y2={pad + g * (h - pad * 2 - 10)}
          stroke="var(--line)"
        />
      ))}
      <polyline
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map((p, i) => `${X(i)},${Y(p.y)}`).join(" ")}
      />
      <circle cx={X(points.length - 1)} cy={Y(last.y)} r="4.5" fill="var(--accent)" />
      <text x={pad} y={h - 2} fontSize="9" fill="var(--text-muted)">
        {points[0].x}
      </text>
      <text x={w - pad} y={h - 2} fontSize="9" textAnchor="end" fill="var(--text-muted)">
        {last.x}
      </text>
      <text
        x={X(points.length - 1)}
        y={Y(last.y) - 8}
        fontSize="10"
        fontWeight="700"
        textAnchor="end"
        fill="var(--text)"
      >
        {last.y}
        {unit}
      </text>
    </svg>
  );
}

export function BarChart({
  bars,
  label,
}: {
  bars: { x: string; y: number; highlight?: boolean }[];
  label: string;
}) {
  const w = 300,
    h = 100,
    max = Math.max(1, ...bars.map((b) => b.y));
  const bw = Math.min(34, (w - 20) / bars.length - 12);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="w-full">
      {bars.map((b, i) => {
        const x = 10 + (i * (w - 20)) / bars.length + ((w - 20) / bars.length - bw) / 2;
        const bh = (b.y / max) * (h - 34);
        return (
          <g key={b.x}>
            <rect
              x={x}
              y={h - 18 - bh}
              width={bw}
              height={Math.max(bh, 2)}
              rx="6"
              fill={b.highlight ? "var(--accent)" : "var(--brand)"}
            />
            <text
              x={x + bw / 2}
              y={h - 22 - bh}
              fontSize="10"
              fontWeight="700"
              textAnchor="middle"
              fill="var(--text)"
            >
              {b.y}
            </text>
            <text
              x={x + bw / 2}
              y={h - 4}
              fontSize="9"
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {b.x}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
