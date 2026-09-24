import { useMemo, useState } from "react";
import type { DashboardPlayer, DashboardWeek } from "../../../src/types/dashboard";
import { PlayerTable } from "./PlayerTable";

const POSITIONS = ["All", "QB", "RB", "WR", "TE"] as const;
type PositionFilter = (typeof POSITIONS)[number];

const PAGE_SIZE = 60;

export function PlayersView({ week, refreshing }: { week: DashboardWeek; refreshing: boolean }) {
  const [position, setPosition] = useState<PositionFilter>("All");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const sideOf = useMemo(() => {
    const map = new Map<string, "away" | "home">();
    for (const g of week.games) {
      map.set(`${g.gameId}:${g.away.team}`, "away");
      map.set(`${g.gameId}:${g.home.team}`, "home");
    }
    return map;
  }, [week]);

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return week.games.flatMap((g) =>
      g.players
        .filter((p) => position === "All" || p.position === position)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q)
        .map((p) => ({ ...p, gameId: g.gameId })),
    );
  }, [week, position, query]);

  const visible = showAll ? players : [...players].sort((a, b) => score(b) - score(a)).slice(0, PAGE_SIZE);
  const colorFor = (p: DashboardPlayer & { gameId?: string }) =>
    sideOf.get(`${p.gameId}:${p.team}`) === "home" ? "var(--home)" : "var(--away)";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            Player projections {"·"} Week {week.week}
          </h1>
          <p className="page-meta">
            {players.length} players {"·"} ranges are the 10th{"–"}90th percentile of {week.sims.toLocaleString()} simulated games
          </p>
        </div>
      </div>
      <div className="filter-row">
        <div className="segmented" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} type="button" aria-pressed={position === p} onClick={() => setPosition(p)}>
              {p}
            </button>
          ))}
        </div>
        <label>
          <span className="visually-hidden">Search players or team</span>
          <input type="search" placeholder="Player or team" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <section className={`card chart-card${refreshing ? " is-refreshing" : ""}`}>
        <PlayerTable
          players={visible}
          colorFor={colorFor}
          caption={`Week ${week.week} player projections`}
          showTeam
          defaultSort="name"
          qbFirst={position === "QB"}
        />
        <div className="legend" style={{ justifyContent: "space-between" }}>
          <span style={{ display: "flex", gap: 14 }}>
            <span>
              <i style={{ background: "var(--away)" }} /> Away team
            </span>
            <span>
              <i style={{ background: "var(--home)" }} /> Home team
            </span>
          </span>
          {players.length > PAGE_SIZE && (
            <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
              {showAll ? `Show top ${PAGE_SIZE}` : `Show all ${players.length}`}
            </button>
          )}
        </div>
      </section>
    </>
  );
}

// Scrimmage yards, with a small passing credit so starting QBs rank among the top players.
function score(p: DashboardPlayer): number {
  return p.recYards.mean + p.rushYards.mean + (p.starterQb ? 0.2 * p.passYards.mean : 0);
}
