import { useMemo } from "react";
import type { DashboardGame, DashboardTeam } from "../../../src/types/dashboard";
import { bucketize, cropBins, histogramBins, marginBuckets, TOTAL_BUCKETS, type BucketRow } from "../lib/chart";
import { fixed, kickoffLabel, lineLabel, marginLabel, pct, signed } from "../lib/format";
import { formatHash } from "../lib/route";
import { teamName, teamNickname } from "../lib/teams";
import { ChartFrame } from "./ChartFrame";
import { HistogramChart } from "./HistogramChart";
import { PlayerTable } from "./PlayerTable";
import { DEPARTED } from "./GameCard";
import { WinBar } from "./WinBar";

const REASON_LABELS: Record<string, string> = {
  out: "Out",
  doubtful: "Doubtful",
  questionable: "Questionable",
  inactive: "Inactive",
  reserve: "Injured reserve",
  "not active": "Off active roster",
  "not on roster": "No longer on roster",
};

const SIDE_COLOR = { away: "var(--away)", home: "var(--home)" } as const;

function BucketTable({ rows, caption }: { rows: BucketRow[]; caption: string }) {
  return (
    <table>
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th>Outcome</th>
          <th className="num">Share of simulations</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">{pct(r.probability, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InjuryCard({ team, side }: { team: DashboardTeam; side: "away" | "home" }) {
  return (
    <section className="card chart-card" aria-label={`${teamNickname(team.team)} injuries`}>
      <div className="chart-head">
        <div>
          <h3>
            <span className={`team-dot ${side}`} style={{ display: "inline-block", marginRight: 8 }} aria-hidden="true" />
            {teamNickname(team.team)} availability
          </h3>
          <p>
            Net rating effect vs a typical week: <strong>{signed(team.injuryShift, 3)}</strong> EPA/play
            {team.injuryShift >= 0 ? " (healthier than usual, or absences already priced in)" : " (weaker than its rating)"}
          </p>
        </div>
      </div>
      {team.out.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No regulars listed out.
        </p>
      ) : (
        <ul className="injury-list">
          {[...team.out.filter((o) => !DEPARTED.has(o.reason)), ...team.out.filter((o) => DEPARTED.has(o.reason))].map((o) => (
            <li key={o.playerId} className={DEPARTED.has(o.reason) ? "departed" : undefined}>
              <span>
                {o.name} <span className="muted">{o.group}</span>
              </span>
              <span className="muted">
                {REASON_LABELS[o.reason] ?? o.reason}
                {o.probability < 0.9 ? ` (${pct(o.probability)} to miss)` : ""} {"·"} usually {pct(o.role)} of snaps
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GameDetail({ game }: { game: DashboardGame }) {
  const { home, away } = game;
  const favorite = home.winProb >= away.winProb ? home : away;
  const favoriteSide = favorite === home ? "home" : "away";
  const vegasFavoriteProb =
    game.vegas.homeWinProb === null ? null : favoriteSide === "home" ? game.vegas.homeWinProb : 1 - game.vegas.homeWinProb;

  const marginBins = useMemo(() => histogramBins(game.marginHistogram), [game]);
  const totalBins = useMemo(() => histogramBins(game.totalHistogram), [game]);
  const markerLine = (v: number) => lineLabel(v, home.team, away.team);

  const players = (side: "away" | "home") => game.players.filter((p) => p.team === game[side].team);

  return (
    <>
      <a className="back-link" href={formatHash({ view: "slate", season: game.season, week: game.week })}>
        <span aria-hidden="true">{"←"}</span> Week {game.week} slate
      </a>

      <section className="card matchup-hero">
        <div className="hero-top">
          <div>
            <h1 className="hero-title">
              {teamName(away.team)} at {teamName(home.team)}
            </h1>
            <p className="page-meta">
              {kickoffLabel(game.kickoff)}
              {game.neutralSite ? " · neutral site" : ""}
              {game.gameType !== "REG" ? ` · ${game.gameType}` : ""}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="hero-figure">{pct(favorite.winProb)}</div>
            <div className="hero-caption">
              {teamNickname(favorite.team)} win probability
              {vegasFavoriteProb !== null && ` · Vegas ${pct(vegasFavoriteProb)}`}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="winbar-labels">
            <span>
              <span className="team-dot away" style={{ display: "inline-block", marginRight: 6 }} aria-hidden="true" />
              <strong>{teamNickname(away.team)}</strong> {pct(away.winProb)}
            </span>
            <span>
              <strong>{teamNickname(home.team)}</strong> {pct(home.winProb)}
              <span className="team-dot home" style={{ display: "inline-block", marginLeft: 6 }} aria-hidden="true" />
            </span>
          </div>
          <WinBar away={away.team} home={home.team} awayProb={away.winProb} homeProb={home.winProb} large />
        </div>
      </section>

      <div className="tiles">
        <div className="card tile">
          <div className="tile-label">
            Projected score ({away.team}
            {"–"}
            {home.team})
          </div>
          <div className="tile-value">
            {fixed(away.score.mean)} {"–"} {fixed(home.score.mean)}
          </div>
          <div className="tile-sub">
            Medians {away.score.p50}
            {"–"}
            {home.score.p50}
          </div>
        </div>
        <div className="card tile">
          <div className="tile-label">Spread</div>
          <div className="tile-value">{markerLine(game.margin.mean)}</div>
          <div className="tile-sub">Vegas {game.vegas.spread === null ? "—" : markerLine(game.vegas.spread)}</div>
        </div>
        <div className="card tile">
          <div className="tile-label">Total points</div>
          <div className="tile-value">{fixed(game.total.mean)}</div>
          <div className="tile-sub">
            Vegas {game.vegas.total === null ? "—" : fixed(game.vegas.total)} {"·"} 80% range {game.total.p10}
            {"–"}
            {game.total.p90}
          </div>
        </div>
        {game.final && (
          <div className="card tile">
            <div className="tile-label">Final</div>
            <div className="tile-value">
              {away.team} {game.final.away} {"–"} {home.team} {game.final.home}
            </div>
            <div className="tile-sub">
              Actual margin {marginLabel(game.final.home - game.final.away, home.team, away.team)}
            </div>
          </div>
        )}
      </div>

      <div className="two-col">
        <ChartFrame
          title="Margin of victory"
          subtitle={`Share of ${fixed(game.marginHistogram.counts.reduce((a, b) => a + b, 0), 0)} simulated games by final margin`}
          chart={
            <HistogramChart
              bins={cropBins(marginBins)}
              label={`Distribution of the final margin between ${away.team} and ${home.team}`}
              colorFor={(v) => (v > 0 ? SIDE_COLOR.home : v < 0 ? SIDE_COLOR.away : "var(--neutral)")}
              tickStep={7}
              tickLabel={(v) => (v === 0 ? "0" : `${v > 0 ? home.team : away.team} ${Math.abs(v)}`)}
              valueLabel={(v) => marginLabel(v, home.team, away.team)}
              markers={[
                { value: game.margin.mean, label: `Model ${markerLine(game.margin.mean)}` },
                ...(game.vegas.spread === null ? [] : [{ value: game.vegas.spread, label: `Vegas ${markerLine(game.vegas.spread)}` }]),
              ]}
            />
          }
          legend={
            <div className="legend">
              <span>
                <i style={{ background: SIDE_COLOR.away }} /> {teamNickname(away.team)} win
              </span>
              <span>
                <i style={{ background: SIDE_COLOR.home }} /> {teamNickname(home.team)} win
              </span>
            </div>
          }
          table={<BucketTable rows={bucketize(marginBins, marginBuckets(home.team, away.team))} caption="Margin of victory by range" />}
        />
        <ChartFrame
          title="Total points"
          subtitle="Share of simulated games by combined score"
          chart={
            <HistogramChart
              bins={cropBins(totalBins)}
              label={`Distribution of total points in ${away.team} at ${home.team}`}
              colorFor={() => "var(--total)"}
              tickStep={10}
              tickLabel={(v) => String(v)}
              valueLabel={(v) => `${v} total points`}
              markers={[
                { value: game.total.mean, label: `Model ${fixed(game.total.mean)}` },
                ...(game.vegas.total === null ? [] : [{ value: game.vegas.total, label: `Vegas ${fixed(game.vegas.total)}` }]),
              ]}
            />
          }
          table={<BucketTable rows={bucketize(totalBins, TOTAL_BUCKETS)} caption="Total points by range" />}
        />
      </div>

      <h2 className="section-title">Availability</h2>
      <div className="two-col">
        <InjuryCard team={away} side="away" />
        <InjuryCard team={home} side="home" />
      </div>

      <h2 className="section-title">Player projections</h2>
      <p className="page-meta" style={{ marginTop: -6, marginBottom: 12 }}>
        Bars span the 10th{"–"}90th percentile; the tick is the median and the dot is the mean. Numbers show mean and 10th{"–"}90th range.
      </p>
      {(["away", "home"] as const).map((side) => (
        <section key={side} className="card chart-card" style={{ marginBottom: 14 }}>
          <div className="chart-head">
            <h3>
              <span className={`team-dot ${side}`} style={{ display: "inline-block", marginRight: 8 }} aria-hidden="true" />
              {teamName(game[side].team)}
            </h3>
          </div>
          <PlayerTable players={players(side)} colorFor={() => SIDE_COLOR[side]} caption={`${teamName(game[side].team)} player projections`} />
        </section>
      ))}
    </>
  );
}
