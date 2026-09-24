import type { DashboardGame } from "../../../src/types/dashboard";
import { fixed, kickoffLabel, lineLabel, pct } from "../lib/format";
import { formatHash } from "../lib/route";
import { teamNickname } from "../lib/teams";
import { WinBar } from "./WinBar";

export const DISAGREEMENT_POINTS = 3;
const MAX_CHIPS = 3;
export const DEPARTED = new Set(["not on roster", "not active"]);

// Quarterbacks first, then skill players, then everyone else.
export const chipPriority = (group: string) => (group === "QB" ? 0 : ["RB", "WR", "TE"].includes(group) ? 1 : 2);

export function modelPickCorrect(game: DashboardGame): boolean | null {
  if (!game.final || game.final.home === game.final.away) return null;
  return game.home.winProb >= game.away.winProb === game.final.home > game.final.away;
}

function TeamRow({ game, side }: { game: DashboardGame; side: "away" | "home" }) {
  const t = game[side];
  return (
    <div className="team-row">
      <span className={`team-dot ${side}`} aria-hidden="true" />
      <span className="team-name">
        {teamNickname(t.team)}
        <small>{t.team}</small>
      </span>
      <span className="num team-score" title="Projected points">
        {fixed(t.score.mean)}
      </span>
      <span className="num team-prob">{pct(t.winProb)}</span>
    </div>
  );
}

export function GameCard({ game }: { game: DashboardGame }) {
  const { home, away } = game;
  const spreadGap = game.vegas.spread === null ? 0 : Math.abs(game.margin.mean - game.vegas.spread);
  const totalGap = game.vegas.total === null ? 0 : Math.abs(game.total.mean - game.vegas.total);
  const out = [away, home]
    .flatMap((t) => t.out.filter((o) => o.role >= 0.5 && !DEPARTED.has(o.reason)).map((o) => ({ ...o, team: t.team })))
    .sort((a, b) => chipPriority(a.group) - chipPriority(b.group) || b.role - a.role);
  const correct = modelPickCorrect(game);

  return (
    <a
      className="card game-card"
      href={formatHash({ view: "game", season: game.season, week: game.week, gameId: game.gameId })}
      aria-label={`${teamNickname(away.team)} at ${teamNickname(home.team)}: ${teamNickname(home.team)} ${pct(home.winProb)} to win`}
    >
      <div className="game-card-top">
        <span>{kickoffLabel(game.kickoff)}</span>
        <span style={{ display: "flex", gap: 6 }}>
          {game.neutralSite && <span className="badge">Neutral</span>}
          {game.gameType !== "REG" && <span className="badge">{game.gameType}</span>}
          {game.final && <span className="badge">Final</span>}
        </span>
      </div>
      <TeamRow game={game} side="away" />
      <TeamRow game={game} side="home" />
      <WinBar away={away.team} home={home.team} awayProb={away.winProb} homeProb={home.winProb} />
      <dl className="line-grid">
        <dt>Spread</dt>
        <dd className={spreadGap >= DISAGREEMENT_POINTS ? "disagree" : undefined}>Model {lineLabel(game.margin.mean, home.team, away.team)}</dd>
        <dd className="vs">Vegas {game.vegas.spread === null ? "—" : lineLabel(game.vegas.spread, home.team, away.team)}</dd>
        <dt>Total</dt>
        <dd className={totalGap >= DISAGREEMENT_POINTS ? "disagree" : undefined}>Model {fixed(game.total.mean)}</dd>
        <dd className="vs">Vegas {game.vegas.total === null ? "—" : fixed(game.vegas.total)}</dd>
      </dl>
      {out.length > 0 && (
        <div className="chips" aria-label="Key players injured or inactive">
          {out.slice(0, MAX_CHIPS).map((o) => (
            <span className="chip" key={o.playerId}>
              <b>{o.team}</b> {o.name} {o.group}
            </span>
          ))}
          {out.length > MAX_CHIPS && <span className="chip">+{out.length - MAX_CHIPS} more</span>}
        </div>
      )}
      {game.final && (
        <div className="final-row">
          <span>
            Final {away.team} {game.final.away} {"–"} {home.team} {game.final.home}
          </span>
          {correct !== null && (
            <span className={`status ${correct ? "good" : "miss"}`}>
              <span aria-hidden="true">{correct ? "✓" : "✕"}</span>
              {correct ? "Model pick won" : "Model pick lost"}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
