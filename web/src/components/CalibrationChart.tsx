import { useState } from "react";
import type { CalibrationBucket } from "../../../src/types/eval";
import { linearScale } from "../lib/chart";
import { pct } from "../lib/format";
import { useWidth } from "../lib/useWidth";

interface Series {
  name: string;
  color: string;
  buckets: readonly CalibrationBucket[];
}

const M = { top: 16, right: 16, bottom: 40, left: 46 };

export function CalibrationChart({ series }: { series: readonly Series[] }) {
  const [active, setActive] = useState<{ series: string; bucket: CalibrationBucket } | null>(null);
  const [frameRef, width] = useWidth<HTMLDivElement>(520);
  const SIZE = { width, height: Math.min(380, Math.max(260, width * 0.7)) };
  const x = linearScale([0, 1], [M.left, SIZE.width - M.right]);
  const y = linearScale([0, 1], [SIZE.height - M.bottom, M.top]);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const points = (s: Series) => s.buckets.filter((b) => b.games > 0);

  return (
    <div className="chart-body" ref={frameRef}>
      <svg className="chart-svg" viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} role="img" aria-label="Predicted versus actual home win rate by probability bucket">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {pct(t)}
            </text>
            <text x={x(t)} y={SIZE.height - M.bottom + 18} textAnchor="middle">
              {pct(t)}
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--axis)" strokeWidth={1.5} />
        <text x={x(0.97)} y={y(0.97) - 8} textAnchor="end">
          perfect calibration
        </text>
        <text x={(x(0) + x(1)) / 2} y={SIZE.height - 4} textAnchor="middle">
          Predicted home win probability
        </text>
        <text transform={`translate(12 ${(y(0) + y(1)) / 2}) rotate(-90)`} textAnchor="middle">
          Actual home win rate
        </text>
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points(s)
              .map((b) => `${x(b.meanPredicted)},${y(b.actualRate)}`)
              .join(" ")}
          />
        ))}
        {series.flatMap((s) =>
          points(s).map((b) => (
            <g
              key={`${s.name}-${b.lower}`}
              tabIndex={0}
              role="img"
              aria-label={`${s.name}, ${pct(b.lower)} to ${pct(b.upper)}: predicted ${pct(b.meanPredicted, 1)}, actual ${pct(b.actualRate, 1)}, ${b.games} games`}
              onPointerEnter={() => setActive({ series: s.name, bucket: b })}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive({ series: s.name, bucket: b })}
              onBlur={() => setActive(null)}
            >
              <circle cx={x(b.meanPredicted)} cy={y(b.actualRate)} r={12} fill="transparent" />
              <circle cx={x(b.meanPredicted)} cy={y(b.actualRate)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            </g>
          )),
        )}
      </svg>
      {active && (
        <div
          className="tooltip"
          style={{
            left: `${(x(active.bucket.meanPredicted) / SIZE.width) * 100}%`,
            top: `${(y(active.bucket.actualRate) / SIZE.height) * 100}%`,
          }}
          role="status"
        >
          <strong>{pct(active.bucket.actualRate, 1)} actual</strong>
          <span>
            <i className="key" style={{ background: series.find((s) => s.name === active.series)?.color }} />
            {active.series} predicted {pct(active.bucket.meanPredicted, 1)} {"·"} {active.bucket.games} games
          </span>
        </div>
      )}
    </div>
  );
}
