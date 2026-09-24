import type { DriveModel } from "../sim/driveModel";
import { simulateGame } from "../sim/game";
import { quantile } from "../sim/monteCarlo";
import { createRng, hashSeed } from "../sim/rng";
import type { PlayerConfig, PlayerProjection, StatSummary, TeamUsage } from "../types/players";
import type { Matchup, SimConfig } from "../types/sim";
import { allocateGame } from "./allocate";
import { adjustPassRate } from "./teamStats";

export interface PlayerProjectionInputs {
  gameId: string;
  model: DriveModel;
  matchup: Matchup;
  usage: { home: TeamUsage; away: TeamUsage };
  passShareDelta: { home: number; away: number };
  simConfig: SimConfig;
  playerConfig: PlayerConfig;
  sims: number;
  seed: number;
}

const STATS = ["targets", "carries", "receptions", "recYards", "rushYards", "touchdowns", "passYards", "passTds", "interceptions"] as const;
type Tracked = (typeof STATS)[number];

export function summarize(values: Float64Array): StatSummary {
  const sorted = Float64Array.from(values).sort();
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

export function projectPlayers(inputs: PlayerProjectionInputs): PlayerProjection[] {
  const { sims, usage } = inputs;
  const gameRng = createRng(hashSeed(inputs.seed, inputs.gameId));
  const allocationRng = createRng(hashSeed(inputs.seed, `${inputs.gameId}/players`));
  const sides = [
    { side: "home" as const, usage: usage.home, opponent: usage.away.team },
    { side: "away" as const, usage: usage.away, opponent: usage.home.team },
  ];
  const tracked = sides.map(({ usage: u }) =>
    u.players.map(() => Object.fromEntries(STATS.map((s) => [s, new Float64Array(sims)])) as Record<Tracked, Float64Array>),
  );

  for (let i = 0; i < sims; i++) {
    const result = simulateGame(inputs.model, inputs.matchup, inputs.simConfig, gameRng);
    sides.forEach(({ side, usage: u }, s) => {
      const stats = adjustPassRate(side === "home" ? result.homeStats : result.awayStats, inputs.passShareDelta[side]);
      const allocated = allocateGame(stats, u, inputs.playerConfig, allocationRng);
      allocated.players.forEach((line, p) => {
        const t = tracked[s]![p]!;
        t.targets[i] = line.targets;
        t.carries[i] = line.carries;
        t.receptions[i] = line.receptions;
        t.recYards[i] = line.recYards;
        t.rushYards[i] = line.rushYards;
        t.touchdowns[i] = line.recTds + line.rushTds;
        if (u.players[p]!.playerId === u.starterQb) {
          t.passYards[i] = stats.passYards;
          t.passTds[i] = stats.passTds;
          t.interceptions[i] = stats.interceptions;
        }
      });
    });
  }

  const mean = (values: Float64Array) => values.reduce((a, b) => a + b, 0) / values.length;
  return sides.flatMap(({ usage: u, opponent }, s) =>
    u.players.map((player, p): PlayerProjection => {
      const t = tracked[s]![p]!;
      return {
        gameId: inputs.gameId,
        playerId: player.playerId,
        name: player.name,
        position: player.position,
        team: u.team,
        opponent,
        starterQb: player.playerId === u.starterQb,
        targets: mean(t.targets),
        carries: mean(t.carries),
        receptions: summarize(t.receptions),
        recYards: summarize(t.recYards),
        rushYards: summarize(t.rushYards),
        passYards: summarize(t.passYards),
        passTds: mean(t.passTds),
        interceptions: mean(t.interceptions),
        touchdowns: summarize(t.touchdowns),
        anytimeTdProb: t.touchdowns.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0) / sims,
      };
    }),
  );
}
