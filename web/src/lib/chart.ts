import type { Histogram } from "../../../src/types/sim";

export interface Scale {
  (value: number): number;
  invert(pixel: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  scale.invert = (p: number) => d0 + ((p - r0) / (r1 - r0)) * span;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

// Round tick values (1, 2, 2.5, 5 x 10^n) from min up to the first tick at or above max,
// so a scale built on the last tick always contains the data.
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const first = Math.ceil(min / step - 1e-9) * step;
  const last = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export interface Bin {
  value: number;
  probability: number;
}

export function histogramBins(histogram: Histogram): Bin[] {
  const total = histogram.counts.reduce((a, b) => a + b, 0) || 1;
  return histogram.counts.map((count, i) => ({ value: histogram.start + i, probability: count / total }));
}

// Drops thin tails so the plot spends its width on the central mass; the tails stay in the table view.
export function cropBins(bins: readonly Bin[], coverage = 0.99): Bin[] {
  const tail = (1 - coverage) / 2;
  let lo = 0;
  let cumulative = 0;
  while (lo < bins.length - 1 && cumulative + bins[lo]!.probability <= tail) cumulative += bins[lo++]!.probability;
  let hi = bins.length - 1;
  cumulative = 0;
  while (hi > lo && cumulative + bins[hi]!.probability <= tail) cumulative += bins[hi--]!.probability;
  return bins.slice(lo, hi + 1);
}

export interface BucketRow {
  label: string;
  probability: number;
}

export function bucketize(
  bins: readonly Bin[],
  buckets: readonly { label: string; test: (value: number) => boolean }[],
): BucketRow[] {
  return buckets.map((b) => ({
    label: b.label,
    probability: bins.filter((bin) => b.test(bin.value)).reduce((s, bin) => s + bin.probability, 0),
  }));
}

export function marginBuckets(home: string, away: string) {
  return [
    { label: `${away} by 14+`, test: (v: number) => v <= -14 },
    { label: `${away} by 7–13`, test: (v: number) => v <= -7 && v > -14 },
    { label: `${away} by 1–6`, test: (v: number) => v < 0 && v > -7 },
    { label: "Tie", test: (v: number) => v === 0 },
    { label: `${home} by 1–6`, test: (v: number) => v > 0 && v < 7 },
    { label: `${home} by 7–13`, test: (v: number) => v >= 7 && v < 14 },
    { label: `${home} by 14+`, test: (v: number) => v >= 14 },
  ];
}

export const TOTAL_BUCKETS = [
  { label: "Under 30", test: (v: number) => v < 30 },
  { label: "30–39", test: (v: number) => v >= 30 && v < 40 },
  { label: "40–49", test: (v: number) => v >= 40 && v < 50 },
  { label: "50–59", test: (v: number) => v >= 50 && v < 60 },
  { label: "60 or more", test: (v: number) => v >= 60 },
];

// Path for a column with rounded top corners and a square base.
export function columnPath(x: number, width: number, top: number, base: number, radius: number): string {
  const h = base - top;
  if (h <= 0 || width <= 0) return "";
  const r = Math.min(radius, width / 2, h);
  return [
    `M${x},${base}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${base}`,
    "Z",
  ].join(" ");
}
