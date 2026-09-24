import type { Rng } from "../sim/rng";
import type { PlayerConfig, TeamUsage } from "../types/players";
import type { TeamGameStats } from "../types/sim";
import { sampleGamma, sampleWeighted } from "./random";

export interface PlayerLine {
  targets: number;
  receptions: number;
  recYards: number;
  recTds: number;
  carries: number;
  rushYards: number;
  rushTds: number;
}

export interface AllocatedGame {
  players: PlayerLine[];
  other: PlayerLine;
}

const emptyLine = (): PlayerLine => ({
  targets: 0,
  receptions: 0,
  recYards: 0,
  recTds: 0,
  carries: 0,
  rushYards: 0,
  rushTds: 0,
});

function spread(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  return sum > 0 ? weights.map((w) => (total * w) / sum) : weights.map(() => 0);
}

function noisyWeight(count: number, perUnit: number, cv: number, rng: Rng): number {
  if (count <= 0) return 0;
  return perUnit * sampleGamma(count / (cv * cv), cv * cv, rng);
}

// Game-to-game usage swings: each player's share is scaled by mean-one gamma noise with the given
// coefficient of variation. The "other" bucket takes whatever is left of the expected total.
export function gameShares(shares: readonly number[], cv: number, rng: Rng): number[] {
  const expected = shares.map((s) => Math.max(0, s));
  const other = Math.max(0, 1 - expected.reduce((a, b) => a + b, 0));
  const noisy = cv > 0 ? expected.map((s) => (s > 0 ? s * sampleGamma(1 / (cv * cv), cv * cv, rng) : 0)) : expected;
  return [...noisy, other];
}

// Splits one simulated team box score among players. Index players.length is the "other"
// bucket: receivers and runners outside the projected rotation.
export function allocateGame(stats: TeamGameStats, usage: TeamUsage, config: PlayerConfig, rng: Rng): AllocatedGame {
  const n = usage.players.length;
  const lines = Array.from({ length: n + 1 }, emptyLine);
  const targetShares = gameShares(usage.players.map((p) => p.targetShare), config.shareVolatility.targets, rng);
  const carryShares = gameShares(usage.players.map((p) => p.carryShare), config.shareVolatility.carries, rng);
  const catchRates = [...usage.players.map((p) => p.catchRate), usage.other.catchRate];
  const yardsPerCatch = [
    ...usage.players.map((p) => p.yardsPerTarget / Math.max(0.2, p.catchRate)),
    usage.other.yardsPerTarget / usage.other.catchRate,
  ];
  const yardsPerCarry = [...usage.players.map((p) => p.yardsPerCarry), usage.other.yardsPerCarry];

  for (let t = 0; t < stats.targets; t++) lines[sampleWeighted(targetShares, rng)]!.targets++;

  const remaining = lines.map((l) => l.targets);
  const completions = Math.min(stats.completions, stats.targets);
  for (let c = 0; c < completions; c++) {
    const i = sampleWeighted(
      remaining.map((r, j) => r * catchRates[j]!),
      rng,
    );
    if (i < 0) break;
    lines[i]!.receptions++;
    remaining[i]!--;
  }

  const recYards = spread(
    stats.passYards,
    lines.map((l, i) => noisyWeight(l.receptions, yardsPerCatch[i]!, config.yardsCv.receiving, rng)),
  );
  recYards.forEach((y, i) => (lines[i]!.recYards = y));

  const recTdWeights = [...usage.players.map((p) => p.rzTargetShare), targetShares[n]!].map((w, i) =>
    lines[i]!.receptions > 0 ? Math.max(w, 1e-3) : 0,
  );
  for (let td = 0; td < stats.passTds; td++) {
    const i = sampleWeighted(recTdWeights, rng);
    if (i >= 0) lines[i]!.recTds++;
  }

  for (let c = 0; c < stats.carries; c++) lines[sampleWeighted(carryShares, rng)]!.carries++;
  const rushYards = spread(
    stats.rushYards,
    lines.map((l, i) => noisyWeight(l.carries, yardsPerCarry[i]!, config.yardsCv.rushing, rng)),
  );
  rushYards.forEach((y, i) => (lines[i]!.rushYards = y));

  const rushTdWeights = [...usage.players.map((p) => p.rzCarryShare), carryShares[n]!].map((w, i) =>
    lines[i]!.carries > 0 ? Math.max(w, 1e-3) : 0,
  );
  for (let td = 0; td < stats.rushTds; td++) {
    const i = sampleWeighted(rushTdWeights, rng);
    if (i >= 0) lines[i]!.rushTds++;
  }

  return { players: lines.slice(0, n), other: lines[n]! };
}
