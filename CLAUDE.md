# Gridiron Sim — NFL game & player-stat simulator

## Goal

Predict weekly NFL game outcomes (win probability, score distribution, spread, total) and player stat distributions (passing/rushing/receiving) via Monte Carlo simulation. Benchmark against Vegas lines.

## Stack

- TypeScript (strict), Node 22+, pnpm
- DuckDB (`@duckdb/node-api`) for storing and querying play-by-play
- Zod for validating all external data at ingest boundaries
- Vitest for tests
- Seeded PRNG (e.g. `pure-rand` or a small xoshiro implementation) — every simulation must be reproducible from a seed
- Later: React + Vite dashboard (Phase 6)

## Conventions

- Minimal comments; clear names over explanation
- Tests: verbose nested `describe` blocks (module → function → scenario), one behavior per `it`
- Zod error messages as short fragments: `"missing play_type"`, `"invalid week"`
- Pure functions for all model math; I/O confined to `src/data/`
- No `any`. Domain types live in `src/types/`

## Data source

nflverse (free). Files are published as GitHub release assets under `nflverse/nflverse-data`:

- play-by-play by season (includes EPA, WP, spread_line, total_line)
- weekly player stats, rosters, schedules
  Verify current release tag names and file formats (csv.gz vs parquet) before hardcoding URLs. DuckDB can read parquet directly; prefer parquet if available.
  Cache raw downloads in `data/raw/`; never re-download a season that is already cached unless forced.
  Network note: I sometimes work behind an egress filter. If a download fails, report the exact URL and error instead of retrying blindly.

## Project layout

```
src/
  data/        ingest, cache, zod schemas, duckdb setup
  features/    team strength, pace, player usage shares
  sim/         drive engine, game sim, monte carlo runner, rng
  players/     stat allocation from simulated team totals
  eval/        backtesting + metrics
  cli/         entry points
  types/
tests/         mirrors src/
```

## Build phases

Work one phase at a time. Stop at the end of each phase, summarize, and wait for me.

### Phase 1 — Data layer

- CLI: `pnpm ingest --seasons 2021-2025`
- Load play-by-play, schedules, weekly player stats into DuckDB tables
- Zod-validate a representative row shape per table; count and log rejected rows
- Done when: row counts per season are printed and a sample query (team EPA/play for one week) works

### Phase 2 — Team features

- Per team, per week, using only data available _before_ that week (no leakage):
  - offensive & defensive EPA/play, split pass/rush
  - opponent adjustment (iterative or ridge)
  - recency weighting (exponential decay, configurable half-life)
  - regression to the mean early season, blended with prior-season rating
  - pace: plays per game, neutral-situation pass rate
- Done when: tests prove no future data enters week N features

### Phase 3 — Drive simulator + Monte Carlo

- Simulate a game as alternating possessions
- Each drive outcome (TD, FG, punt, turnover, end of half) drawn from probabilities conditioned on offense vs. defense ratings and starting field position
- Fit outcome probabilities from historical drives (start with multinomial logistic regression or binned empirical rates)
- Model starting field position from the previous drive's outcome
- Home-field advantage as a tunable parameter
- Runner: N sims (default 10,000) → win prob, mean/median score, spread & total distributions, percentiles
- Done when: `pnpm sim --season 2025 --week 5` prints every game's projection

### Phase 4 — Backtest

- Walk-forward over 2022–2025 (fit on past only, predict each week)
- Metrics: Brier score and log loss on winners; MAE on margin and total; calibration buckets
- Compare side by side against Vegas `spread_line` / `total_line`
- Done when: a report table prints model vs. market for each season

### Phase 5 — Player stat allocation

- From each simulated game, take team pass attempts, rush attempts, and yards
- Allocate to players using rolling usage shares: target share, carry share, air-yards share, red-zone share
- Per-player efficiency (yards/target, yards/carry) regressed to position means
- Output per-player distributions (mean + 10/50/90 percentiles) for yards, receptions, TDs
- Handle injuries/inactives via a manual override file for now
- Done when: projections print for all skill players in a given week

### Phase 6 — Dashboard (later)

- React + Vite page: weekly slate, win probabilities, score histograms, player projection ranges

## Out of scope for now

Play-by-play simulation of individual snaps, betting/odds APIs, weather, live in-game updates.
