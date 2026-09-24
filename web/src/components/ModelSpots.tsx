import type { DashboardGame } from "../../../src/types/dashboard";
import type { SituationPick } from "../../../src/types/situations";
import { formatHash } from "../lib/route";
import { resultLabel, spotHistory } from "../lib/spots";

const gameHref = (g: DashboardGame) => formatHash({ view: "game", season: g.season, week: g.week, gameId: g.gameId });

function SpotLine({ spots }: { spots: SituationPick[] }) {
  const [first] = spots;
  if (!first) return null;
  const result = resultLabel(first.result);
  return (
    <div className="spot-line">
      <strong>{first.bet}</strong>
      <span className="muted">
        {spots.map((s) => s.label).join(" · ")} {"—"} {spotHistory(first)}
      </span>
      {result && <span className={`status ${first.result === "win" ? "good" : "miss"}`}>{result}</span>}
    </div>
  );
}

// Games this week that fall into the situations where the model has historically done best.
// Spread spots get a row each; totals situations cover many games, so they share one row.
export function ModelSpots({ games }: { games: DashboardGame[] }) {
  const spreadGames = games.filter((g) => (g.spots ?? []).some((s) => s.market === "spread"));
  const totals = games.flatMap((g) => (g.spots ?? []).filter((s) => s.market === "total").map((s) => ({ game: g, spot: s })));
  const [firstTotal] = totals;
  return (
    <section className="card chart-card spots-card" aria-label="Model's best spots this week">
      <div className="chart-head">
        <div>
          <h3>Model{"’"}s best spots this week</h3>
          <p>
            Picks in situations where the model{"’"}s side has beaten the 52.4% break-even since 2022. Those situations were chosen from past
            results, so the Record page{"’"}s live tracker is the real test.
          </p>
        </div>
      </div>
      {spreadGames.length === 0 && totals.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No games fit those situations this week.
        </p>
      ) : (
        <ul className="spot-list">
          {spreadGames.map((g) => (
            <li key={g.gameId}>
              <a href={gameHref(g)}>
                {g.away.team} @ {g.home.team}
              </a>
              <SpotLine spots={(g.spots ?? []).filter((s) => s.market === "spread")} />
            </li>
          ))}
          {firstTotal && (
            <li>
              <span>{firstTotal.spot.label}s</span>
              <div>
                <div className="muted">{spotHistory(firstTotal.spot)}</div>
                <div className="chips" style={{ marginTop: 6 }}>
                  {totals.map(({ game, spot }) => (
                    <a className="chip spot" key={game.gameId} href={gameHref(game)}>
                      {game.away.team} @ {game.home.team} <b>{spot.bet}</b>
                      {spot.result && ` (${resultLabel(spot.result)?.toLowerCase()})`}
                    </a>
                  ))}
                </div>
              </div>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
