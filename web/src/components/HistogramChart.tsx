import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { columnPath, linearScale, niceTicks, type Bin } from "../lib/chart";
import { pct } from "../lib/format";
import { useWidth } from "../lib/useWidth";

export interface Marker {
  value: number;
  label: string;
}

interface HistogramChartProps {
  bins: readonly Bin[];
  label: string;
  colorFor: (value: number) => string;
  tickStep: number;
  tickLabel: (value: number) => string;
  valueLabel: (value: number) => string;
  markers?: readonly Marker[];
  height?: number;
}

const MARGIN = { top: 46, right: 12, bottom: 30, left: 40 };
const MIN_TICK_SPACING = 58;

export function HistogramChart({
  bins,
  label,
  colorFor,
  tickStep,
  tickLabel,
  valueLabel,
  markers = [],
  height = 240,
}: HistogramChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [frameRef, WIDTH] = useWidth<HTMLDivElement>(640);

  const layout = useMemo(() => {
    const first = bins[0]?.value ?? 0;
    const last = bins[bins.length - 1]?.value ?? 0;
    const x = linearScale([first - 0.5, last + 0.5], [MARGIN.left, WIDTH - MARGIN.right]);
    const maxP = Math.max(0.0001, ...bins.map((b) => b.probability));
    const yTicks = niceTicks(0, maxP, 4);
    const y = linearScale([0, yTicks[yTicks.length - 1] ?? maxP], [height - MARGIN.bottom, MARGIN.top]);
    const slot = x(first + 1) - x(first);
    const barWidth = Math.max(1, Math.min(24, slot - 2));
    let step = tickStep;
    while (slot * step < MIN_TICK_SPACING && step < 1000) step += tickStep;
    const xTicks: number[] = [];
    for (let v = Math.ceil(first / step) * step; v <= last; v += step) xTicks.push(v);
    return { x, y, yTicks, xTicks, barWidth, slot };
  }, [bins, height, tickStep, WIDTH]);

  const { x, y, yTicks, xTicks, barWidth, slot } = layout;
  const base = height - MARGIN.bottom;
  const activeBin = active === null ? null : bins[active];

  function indexAtPointer(event: PointerEvent<SVGSVGElement>): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const value = Math.round(x.invert(px));
    const index = bins.findIndex((b) => b.value === value);
    return index >= 0 ? index : null;
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (bins.length === 0) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(bins.length - 1);
    else if (step !== 0) {
      const modeIndex = bins.reduce((best, b, i) => (b.probability > bins[best]!.probability ? i : best), 0);
      setActive((current) => Math.min(bins.length - 1, Math.max(0, (current ?? modeIndex) + step)));
    } else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  }

  // Close markers split their labels to either side of the lines; otherwise labels center on their line.
  const sorted = markers.map((m) => ({ ...m, px: x(m.value) })).sort((a, b) => a.px - b.px);
  const markerRows = sorted.map((m, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const near = (other: typeof m | undefined) => other !== undefined && Math.abs(other.px - m.px) < 120;
    const side: "left" | "right" | "center" = near(next) ? "left" : near(prev) ? "right" : "center";
    return { ...m, side };
  });

  return (
    <div className="chart-body" ref={frameRef}>
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`${label}. Use left and right arrow keys to read each value.`}
        tabIndex={0}
        onPointerMove={(e) => setActive(indexAtPointer(e))}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {pct(t, t < 0.1 && t > 0 ? 0 : 0)}
            </text>
          </g>
        ))}
        {bins.map((b, i) => {
          const cx = x(b.value);
          const d = columnPath(cx - barWidth / 2, barWidth, y(b.probability), base, 2);
          return d ? (
            <path key={b.value} d={d} fill={colorFor(b.value)} opacity={active === null || active === i ? 1 : 0.45} />
          ) : null;
        })}
        {activeBin && (
          <rect
            x={x(activeBin.value) - slot / 2}
            y={MARGIN.top}
            width={slot}
            height={base - MARGIN.top}
            fill="var(--wash)"
            pointerEvents="none"
          />
        )}
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={base} y2={base} stroke="var(--axis)" strokeWidth={1} />
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={base + 18} textAnchor="middle">
            {tickLabel(t)}
          </text>
        ))}
        {markerRows.map((m) => {
          const labelY = MARGIN.top - 14;
          const edgeAnchor = m.px > WIDTH - 90 ? "end" : m.px < MARGIN.left + 60 ? "start" : "middle";
          const anchor = m.side === "left" ? "end" : m.side === "right" ? "start" : edgeAnchor;
          const dx = m.side === "left" ? -5 : m.side === "right" ? 5 : 0;
          return (
            <g key={m.label}>
              <line x1={m.px} x2={m.px} y1={m.side === "center" ? labelY + 4 : labelY - 10} y2={base} stroke="var(--ink-2)" strokeWidth={1.5} />
              <text className="marker-label" x={m.px + dx} y={labelY} textAnchor={anchor}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      {activeBin && (
        <div
          className="tooltip"
          style={{
            left: `${(x(activeBin.value) / WIDTH) * 100}%`,
            top: `${(y(activeBin.probability) / height) * 100}%`,
          }}
          role="status"
        >
          <strong>{pct(activeBin.probability, 1)}</strong>
          <span>
            <i className="key" style={{ background: colorFor(activeBin.value) }} />
            {valueLabel(activeBin.value)}
          </span>
        </div>
      )}
    </div>
  );
}
