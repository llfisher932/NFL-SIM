import type { DatasetId, RawFile } from "../types/data";

export const RELEASE_BASE_URL = "https://github.com/nflverse/nflverse-data/releases/download";

interface ReleaseAsset {
  tag: string;
  fileName: (season: number) => string;
  perSeason: boolean;
}

const ASSETS: Record<DatasetId, ReleaseAsset> = {
  pbp: { tag: "pbp", fileName: (s) => `play_by_play_${s}.parquet`, perSeason: true },
  schedules: { tag: "schedules", fileName: () => "games.parquet", perSeason: false },
  player_weekly_stats: {
    tag: "stats_player",
    fileName: (s) => `stats_player_week_${s}.parquet`,
    perSeason: true,
  },
  injury_reports: { tag: "injuries", fileName: (s) => `injuries_${s}.parquet`, perSeason: true },
  snap_counts: { tag: "snap_counts", fileName: (s) => `snap_counts_${s}.parquet`, perSeason: true },
  weekly_rosters: { tag: "weekly_rosters", fileName: (s) => `roster_weekly_${s}.parquet`, perSeason: true },
  players: { tag: "players", fileName: () => "players.parquet", perSeason: false },
  contracts: { tag: "contracts", fileName: () => "historical_contracts.parquet", perSeason: false },
};

function rawFile(dataset: DatasetId, season: number | null): RawFile {
  const asset = ASSETS[dataset];
  const name = asset.fileName(season ?? 0);
  return {
    dataset,
    season,
    url: `${RELEASE_BASE_URL}/${asset.tag}/${name}`,
    relativePath: `${asset.tag}/${name}`,
  };
}

export function rawFilesFor(seasons: readonly number[]): RawFile[] {
  return (Object.keys(ASSETS) as DatasetId[]).flatMap((dataset) =>
    ASSETS[dataset].perSeason ? seasons.map((s) => rawFile(dataset, s)) : [rawFile(dataset, null)],
  );
}
