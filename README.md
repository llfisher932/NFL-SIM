# NFL-SIM

Gridiron Sim: a Monte Carlo simulator for NFL games and player stats, built on free
[nflverse](https://github.com/nflverse/nflverse-data) data and benchmarked against Vegas.

Every projection uses only information available before kickoff; walk-forward tests enforce it.

**Live dashboard:** https://llfisher932.github.io/NFL-SIM/ (refreshed daily, plus Sunday late morning).

## Setup

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm ingest --seasons 2012-2026
```

Raw files are cached in `data/raw/` and loaded into DuckDB at `data/nfl.duckdb` (both git-ignored).

## Commands

| Command | What it does |
|---|---|
| `pnpm ingest --seasons 2012-2026 [--force]` | Download (once) and load play-by-play, schedules, player stats, injury reports, rosters, snap counts, contracts |
| `pnpm refresh [--season 2026] [--publish]` | Re-download the current season, re-ingest, export the latest and next week, log pre-kickoff picks, optionally publish |
| `pnpm sim --season 2025 --week 5` | Game projections: win probability, score, spread and total ranges, injury shifts |
| `pnpm players --season 2025 --week 5 [--team BUF]` | Player projections (mean and p10/p50/p90) |
| `pnpm export --season 2025 --weeks 1-6` | Write dashboard JSON to `web/public/data` |
| `pnpm dashboard` | Run the dashboard at http://localhost:5173 (`--host` to open it to your network) |
| `pnpm dashboard:publish` | Build the dashboard and publish it to the `gh-pages` branch (GitHub Pages) |
| `pnpm backtest [--seasons 2015-2025] [--workers N]` | Walk-forward backtest vs the market, split across parallel worker processes |
| `pnpm player-backtest --season 2024` | Score player projections against box scores |
| `pnpm tune` | Feature and home-field tuning with held-out seasons |
| `pnpm test` / `pnpm typecheck` | Tests and type checks |

## Overrides

Injury reports, inactive lists and roster moves are applied automatically. When news beats the
data (a QB ruled out before nflverse catches up), add an entry to `overrides.json`; manual entries
win and move both the team rating and the player projections.

```json
[
  { "season": 2026, "week": 3, "throughWeek": 18, "playerId": "00-0040691", "status": "out", "note": "out for the season" },
  { "season": 2026, "week": 5, "playerId": "00-0036900", "playing": 0.5, "note": "snap count limited" },
  { "season": 2026, "week": 5, "playerId": "00-0039000", "targetShare": 0.2 }
]
```

`throughWeek` repeats an entry for a range of weeks; `playing` scales a player's usual usage.

## How it works

1. **Team ratings**: opponent-adjusted EPA/play from a weighted ridge fit over earlier games, with
   recency decay and shrinkage toward last season's regressed rating.
2. **Quarterbacks**: every QB is rated from his earlier dropbacks (EPA/dropback, regressed toward a
   prior set by draft slot and experience). Each game's expected starter (the listed starter,
   blended with his backup by the chance he sits) is compared with the QB quality already baked
   into the team's rating; the difference shifts the offense. This covers injuries, benchings and
   offseason changes.
3. **Injuries and talent**: every position group's missing snap share shifts the ratings, with each
   player's snaps weighted by his contract (share of the cap vs his position's median) as a free
   talent proxy. Each team is measured against that week's typical absences, so league-wide churn
   (like week-1 offseason departures) moves no one. Effects are fit only on earlier games.
4. **Situations**: week-18 starters on teams whose playoff seed is already locked (checked against
   every final-week outcome with the NFL tiebreakers) sit most of their snaps, as measured from
   2021-2025 snap counts; rest-day differences adjust home-field advantage.
5. **Drive simulator**: a multinomial model picks each drive's outcome from field position, the
   matchup, the league's current scoring level, the clock and the score; drive length, end spot and
   box score come from similar real drives. Everything learns from 2012 on.
6. **Monte Carlo**: 10,000 simulated games per matchup, seeded and reproducible.
7. **Players**: each simulated box score is split among players by rolling usage shares, with
   efficiency regressed to position means.

## Results (walk-forward, 2015-2025, 3,027 games)

| | Model | Market |
|---|---|---|
| Brier score | 0.2178 | 0.2116 |
| Log loss | 0.6262 | 0.6126 |
| Margin MAE | 10.07 | 9.81 |
| Total MAE | 10.73 | 10.44 |

The market is still more accurate. Against the spread the model's side wins about 51% of games, below
the 52.4% break-even at standard odds. Situations that looked profitable in 2022-2025 (playoffs, 3+
point disagreements, 7+ point spreads, week 1-4 totals) fell to 47-51% on the 2015-2021 seasons they
weren't picked from, so the dashboard only flags a situation once it beats break-even across the
whole backtest in most seasons; none currently does.

**Live tracker:** every refresh logs the model's number and the Vegas line for each game not yet
kicked off. The last entry before kickoff is the pick, graded afterwards against that line and the
closing line (closing line value). It is on the dashboard's Record page and cannot be fitted after
the fact.

Player projections (2024, held out): p10-p90 ranges cover about 80% of receiving and rushing
results, and mean errors beat each player's last-four-game average.
