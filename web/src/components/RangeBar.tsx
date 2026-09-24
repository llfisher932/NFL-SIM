import type { CSSProperties } from "react";
import type { StatSummary } from "../../../src/types/players";

interface RangeBarProps {
  summary: StatSummary;
  max: number;
  color: string;
  label: string;
}

// p10-p90 band, a median tick and a mean dot on a shared per-column scale.
export function RangeBar({ summary, max, color, label }: RangeBarProps) {
  const at = (v: number) => `${(Math.max(0, Math.min(v, max)) / (max || 1)) * 100}%`;
  const band: CSSProperties = {
    left: at(summary.p10),
    width: `calc(${at(summary.p90)} - ${at(summary.p10)})`,
    background: color,
  };
  return (
    <div
      className="range-bar"
      role="img"
      aria-label={`${label}: mean ${summary.mean.toFixed(0)}, 10th percentile ${summary.p10.toFixed(0)}, median ${summary.p50.toFixed(0)}, 90th percentile ${summary.p90.toFixed(0)}`}
    >
      <span className="range-track" />
      <span className="range-band" style={band} />
      <span className="range-median" style={{ left: at(summary.p50) }} />
      <span className="range-mean" style={{ left: at(summary.mean), background: color }} />
    </div>
  );
}
