# NFL-SIM

Gridiron Sim: a Monte Carlo simulator for NFL games and player stats, built on free
[nflverse](https://github.com/nflverse/nflverse-data) data and benchmarked against Vegas.

Every projection uses only information available before kickoff; walk-forward tests enforce it.

**Live dashboard:** https://llfisher932.github.io/NFL-SIM/ (refreshed twice a week).

## Setup

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm ingest --seasons 2021-2025
```

Raw files are cached in `data/raw/` and loaded into DuckDB at `data/nfl.duckdb` (both git-ignored).

## Commands

| Command | What it does |
|---|---|
| `pnpm ingest --seasons 2021-2025 [--force]` | Download (once) and load play-by-play, schedules, player stats, injury reports, rosters, snap counts |
| `pnpm refresh [--season 2026] [--publish]` | Weekly update: re-download the current season, re-ingest, export the latest and next week, optionally publish |
| `pnpm sim --season 2025 --week 5` | Game projections: win probability, score, spread and total ranges, injury shifts |
| `pnpm players --season 2025 --week 5 [--team BUF]` | Player projections (mean and p10/p50/p90) |
| `pnpm export --season 2025 --weeks 1-6` | Write dashboard JSON to `web/public/data` |
| `pnpm dashboard` | Run the dashboard at http://localhost:5173 (`--host` to open it to your network) |
| `pnpm dashboard:publish` | Build the dashboard and publish it to the `gh-pages` branch (GitHub Pages) |
| `pnpm backtest` | Walk-forward backtest 2022-2025 vs the market |
| `pnpm player-backtest --season 2024` | Score player projections against box scores |
| `pnpm tune` | Feature and home-field tuning with held-out seasons |
| `pnpm test` / `pnpm typecheck` | Tests and type checks |

`overrides.json` holds manual player overrides (out, pinned target/carry share, new players).
Injury-report and inactive-list absences are applied automatically; manual overrides win.

## How it works

1. **Team ratings**: opponent-adjusted EPA/play (all, pass, rush) from a weighted ridge fit over
   earlier games, with recency decay and shrinkage toward last season's regressed rating.
2. **Injuries**: every position group's missing snap share (plus QB quality) shifts the ratings,
   by effects fit only on earlier games.
3. **Drive simulator**: a multinomial model picks each drive's outcome from field position, the
   matchup, the clock and the score; drive length, end spot and box score come from similar real drives.
4. **Monte Carlo**: 10,000 simulated games per matchup, seeded and reproducible.
5. **Players**: each simulated box score is split among players by rolling usage shares, with
   efficiency regressed to position means.

## Results (walk-forward, 2022-2025, 1,139 games)

| | Model | Market |
|---|---|---|
| Brier score | 0.2182 | 0.2095 |
| Log loss | 0.6272 | 0.6075 |
| Margin MAE | 9.85 | 9.54 |
| Total MAE | 10.47 | 10.19 |

Player projections (2024, held out): p10-p90 ranges cover about 80% of receiving and rushing
results, and mean errors beat each player's last-four-game average.
