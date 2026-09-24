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
