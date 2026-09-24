import type { DriveModel } from "../sim/driveModel";
import { buildMatchup, type WeekFeatures } from "../sim/matchups";
import type { SeasonWeek } from "../types/features";
import type { PlayerConfig, PlayerGame, PlayerOverride, PlayerProjection } from "../types/players";
import type { SimConfig, WeekGame } from "../types/sim";
import { projectPlayers } from "./project";
import { estimateTeamUsage } from "./usage";

export interface WeekProjectionInputs {
  target: SeasonWeek;
  games: readonly WeekGame[];
  model: DriveModel;
  features: WeekFeatures;
  playerGames: readonly PlayerGame[];
  overrides: readonly PlayerOverride[];
  simConfig: SimConfig;
  playerConfig: PlayerConfig;
  sims: number;
  seed: number;
}

export function projectWeek(inputs: WeekProjectionInputs): PlayerProjection[] {
  const { features, target } = inputs;
  const leaguePassRate = [...features.values()].reduce((s, f) => s + f.neutralPassRate, 0) / features.size;
  const passShareDelta = (team: string) => {
    const f = features.get(team);
    if (!f) throw new Error(`no features for ${team} in ${target.season} week ${target.week}`);
    return f.neutralPassRate - leaguePassRate;
  };
  return inputs.games.flatMap((game) =>
    projectPlayers({
      gameId: game.gameId,
      model: inputs.model,
      matchup: buildMatchup(features, game),
      usage: {
        home: estimateTeamUsage(inputs.playerGames, game.home, target, inputs.overrides, inputs.playerConfig),
        away: estimateTeamUsage(inputs.playerGames, game.away, target, inputs.overrides, inputs.playerConfig),
      },
      passShareDelta: { home: passShareDelta(game.home), away: passShareDelta(game.away) },
      simConfig: inputs.simConfig,
      playerConfig: inputs.playerConfig,
      sims: inputs.sims,
      seed: inputs.seed,
    }),
  );
}
