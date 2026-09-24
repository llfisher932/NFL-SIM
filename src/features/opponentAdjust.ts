import { choleskySolve, zeros } from "./linalg";

export interface Observation {
  offense: string;
  defense: string;
  epaPerPlay: number;
  weight: number;
}

export interface AdjustmentPrior {
  intercept: number;
  offense: ReadonlyMap<string, number>;
  defense: ReadonlyMap<string, number>;
}

export interface AdjustmentPenalty {
  intercept: number;
  offense: number;
  defense: number;
}

export interface AdjustedRatings {
  intercept: number;
  offense: Map<string, number>;
  defense: Map<string, number>;
}

// Weighted ridge fit of epaPerPlay = intercept + offense[team] + defense[opponent],
// with each coefficient shrunk toward its prior. Penalties are in units of weight (plays).
export function fitOpponentAdjusted(
  observations: readonly Observation[],
  teams: readonly string[],
  prior: AdjustmentPrior,
  penalty: AdjustmentPenalty,
): AdjustedRatings {
  const index = new Map(teams.map((team, i) => [team, i]));
  const n = 1 + 2 * teams.length;
  const offenseCol = (team: string) => 1 + indexOf(index, team);
  const defenseCol = (team: string) => 1 + teams.length + indexOf(index, team);

  const a = zeros(n, n);
  const b = new Array<number>(n).fill(0);

  for (const obs of observations) {
    if (obs.weight <= 0) continue;
    const cols = [0, offenseCol(obs.offense), defenseCol(obs.defense)];
    for (const i of cols) {
      b[i]! += obs.weight * obs.epaPerPlay;
      for (const j of cols) a[i]![j]! += obs.weight;
    }
  }

  a[0]![0]! += penalty.intercept;
  b[0]! += penalty.intercept * prior.intercept;
  for (const team of teams) {
    const o = offenseCol(team);
    const d = defenseCol(team);
    a[o]![o]! += penalty.offense;
    a[d]![d]! += penalty.defense;
    b[o]! += penalty.offense * (prior.offense.get(team) ?? 0);
    b[d]! += penalty.defense * (prior.defense.get(team) ?? 0);
  }

  const x = choleskySolve(a, b);
  return {
    intercept: x[0]!,
    offense: new Map(teams.map((team) => [team, x[offenseCol(team)]!])),
    defense: new Map(teams.map((team) => [team, x[defenseCol(team)]!])),
  };
}

function indexOf(index: ReadonlyMap<string, number>, team: string): number {
  const i = index.get(team);
  if (i === undefined) throw new Error(`unknown team: ${team}`);
  return i;
}
