import type { StatSummary } from "../../../src/types/players";
import type { Histogram } from "../../../src/types/sim";

export interface Outcome {
  win: number;
  push: number;
  loss: number;
}

// A discrete distribution over integer outcomes (margins or totals).
export interface Distribution {
  start: number;
  probs: number[];
}

export function parseAmerican(text: string): number | null {
  const value = Number(text.trim().replace("−", "-"));
  if (!Number.isFinite(value) || Math.abs(value) < 100) return null;
  return value;
}

export const toDecimal = (american: number) => (american > 0 ? 1 + american / 100 : 1 + 100 / -american);

// Win probability needed to break even at a price, ignoring pushes.
export const breakEven = (american: number) => 1 / toDecimal(american);

export function fairAmerican(probability: number): string {
  if (probability <= 0.001 || probability >= 0.999) return "—";
  const odds = probability >= 0.5 ? -(100 * probability) / (1 - probability) : (100 * (1 - probability)) / probability;
  return odds > 0 ? `+${Math.round(odds)}` : `−${Math.round(-odds)}`;
}

// Profit per unit staked on average; a push returns the stake.
export const expectedValue = (o: Outcome, american: number) => o.win * (toDecimal(american) - 1) - o.loss;

export function fromHistogram(h: Histogram): Distribution {
  const total = h.counts.reduce((s, c) => s + c, 0);
  return { start: h.start, probs: h.counts.map((c) => (total > 0 ? c / total : 0)) };
}

export const mean = (d: Distribution) => d.probs.reduce((s, p, i) => s + p * (d.start + i), 0);

// Re-centers a simulated distribution on a target mean by exponential tilting, which keeps its
// shape, including the spikes at common margins like 3 and 7, instead of sliding it sideways.
export function tilt(d: Distribution, target: number): Distribution {
  const weighted = (theta: number) => {
    const logs = d.probs.map((p, i) => (p > 0 ? Math.log(p) + theta * (d.start + i) : -Infinity));
    const top = Math.max(...logs);
    const raw = logs.map((l) => (l === -Infinity ? 0 : Math.exp(l - top)));
    const sum = raw.reduce((s, r) => s + r, 0);
    return { start: d.start, probs: raw.map((r) => r / sum) };
  };
  let low = -1;
  let high = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (mean(weighted(mid)) < target) low = mid;
    else high = mid;
  }
  return weighted((low + high) / 2);
}

export function reverse(d: Distribution): Distribution {
  return { start: -(d.start + d.probs.length - 1), probs: [...d.probs].reverse() };
}

// Probability the outcome lands above, on, or below a line.
export function versusLine(d: Distribution, line: number): Outcome {
  let win = 0;
  let push = 0;
  let loss = 0;
  d.probs.forEach((p, i) => {
    const x = d.start + i;
    if (x > line) win += p;
    else if (x === line) push += p;
    else loss += p;
  });
  return { win, push, loss };
}

// Spread bet on a team getting (+) or giving (-) points, from the home-margin distribution.
export function spreadOutcome(homeMargin: Distribution, team: "home" | "away", handicap: number): Outcome {
  const own = team === "home" ? homeMargin : reverse(homeMargin);
  return versusLine(own, -handicap);
}

export function totalOutcome(total: Distribution, side: "over" | "under", line: number): Outcome {
  const o = versusLine(total, line);
  return side === "over" ? o : { win: o.loss, push: o.push, loss: o.win };
}

export function moneylineOutcome(homeMargin: Distribution, team: "home" | "away"): Outcome {
  return spreadOutcome(homeMargin, team, 0);
}

// Approximate CDF through a stat's 10th, 50th and 90th percentiles, with linear tails.
export function summaryCdf(s: StatSummary): (x: number) => number {
  const low = Math.max(0, s.p10 - 0.25 * (s.p50 - s.p10));
  const high = s.p90 + (s.p90 - s.p50);
  const points: [number, number][] = [
    [low, 0],
    [s.p10, 0.1],
    [s.p50, 0.5],
    [s.p90, 0.9],
    [high, 1],
  ];
  return (x) => {
    if (x < points[0]![0]) return 0;
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i]!;
      const [x0, y0] = points[i - 1]!;
      if (x < x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return 1;
  };
}

export function summaryOutcome(s: StatSummary, side: "over" | "under", line: number): Outcome {
  const below = summaryCdf(s)(line);
  return side === "over" ? { win: 1 - below, push: 0, loss: below } : { win: below, push: 0, loss: 1 - below };
}

// Counting stats with a small mean (touchdowns, interceptions) as Poisson.
export function poissonOutcome(rate: number, side: "over" | "under", line: number): Outcome {
  let cumulative = 0;
  let term = Math.exp(-rate);
  let atLine = 0;
  for (let k = 0; k <= Math.max(0, Math.floor(line)); k++) {
    if (k > 0) term *= rate / k;
    if (k === line) atLine = term;
    else cumulative += term;
  }
  const over = 1 - cumulative - atLine;
  return side === "over" ? { win: over, push: atLine, loss: cumulative } : { win: cumulative, push: atLine, loss: over };
}
