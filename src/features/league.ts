// How the league's structure changed over the seasons the model learns from.

export const FIRST_DATA_SEASON = 2012;

export const regularSeasonWeeks = (season: number) => (season >= 2021 ? 18 : 17);

// Seven playoff teams per conference from 2020, six before.
export const playoffSeeds = (season: number) => (season >= 2020 ? 7 : 6);

// Relocated franchises: current code -> the code it used before moving.
export const PREVIOUS_CODE: Readonly<Record<string, string>> = { LA: "STL", LAC: "SD", LV: "OAK" };

// Every code a franchise has used, mapped to its current code.
export const CURRENT_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PREVIOUS_CODE).map(([current, previous]) => [previous, current]),
);

export const seasonsFrom = (first: number, last: number) => Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
