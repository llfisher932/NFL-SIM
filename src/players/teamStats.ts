import type { TeamGameStats } from "../types/sim";

// Shifts a simulated box score toward a team's pass tendency, keeping total plays, per-play
// yardage and touchdowns fixed.
export function adjustPassRate(stats: TeamGameStats, passShareDelta: number): TeamGameStats {
  const plays = stats.passAttempts + stats.carries;
  if (plays === 0 || stats.passAttempts === 0 || stats.carries === 0 || passShareDelta === 0) return stats;
  const share = Math.min(0.95, Math.max(0.05, stats.passAttempts / plays + passShareDelta));
  const passAttempts = Math.round(plays * share);
  const carries = plays - passAttempts;
  const passScale = passAttempts / stats.passAttempts;
  const targets = Math.min(passAttempts, Math.round(stats.targets * passScale));
  const completions = Math.max(stats.passTds, Math.min(targets, Math.round(stats.completions * passScale)));
  return {
    ...stats,
    passAttempts,
    targets,
    completions,
    passYards: stats.passYards * passScale,
    carries,
    rushYards: stats.rushYards * (carries / stats.carries),
  };
}
