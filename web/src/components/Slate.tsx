import { useMemo, useState } from "react";
import type { DashboardWeek } from "../../../src/types/dashboard";
import { generatedLabel, pct } from "../lib/format";
import { GameCard, modelPickCorrect } from "./GameCard";
import { ModelSpots } from "./ModelSpots";

type SortKey = "kickoff" | "confidence" | "disagreement";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "kickoff", label: "Kickoff" },
  { key: "confidence", label: "Most lopsided" },
  { key: "disagreement", label: "Model vs Vegas" },
];

export function Slate({ week, refreshing }: { week: DashboardWeek; refreshing: boolean }) {
  const [sort, setSort] = useState<SortKey>("kickoff");
  const [query, setQuery] = useState("");

  const games = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = week.games.filter((g) => !q || g.home.team.includes(q) || g.away.team.includes(q));
    const key = (g: (typeof filtered)[number]) =>
      sort === "confidence"
        ? -Math.abs(g.home.winProb - 0.5)
        : sort === "disagreement"
          ? -(g.vegas.spread === null ? 0 : Math.abs(g.margin.mean - g.vegas.spread))
          : 0;
    return [...filtered].sort((a, b) => key(a) - key(b) || (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
  }, [week, sort, query]);

  const finals = week.games.filter((g) => modelPickCorrect(g) !== null);
  const wins = finals.filter((g) => modelPickCorrect(g)).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {week.season} season {"·"} Week {week.week}
          </h1>
          <p className="page-meta">
            {week.games.length} games {"·"} {week.sims.toLocaleString()} simulations each {"·"} injuries{" "}
            {week.injuries ? "on" : "off"} {"·"} generated {generatedLabel(week.generatedAt)}
            {finals.length > 0 && (
              <>
                {" · "}
                model picks {wins}
                {"–"}
                {finals.length - wins} ({pct(wins / finals.length)})
              </>
            )}
          </p>
        </div>
      </div>
      <ModelSpots games={week.games} />
      <div className="filter-row">
        <div className="segmented" role="group" aria-label="Sort games">
          {SORTS.map((s) => (
            <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <label>
          <span className="visually-hidden">Filter by team</span>
          <input type="search" placeholder="Filter team (e.g. KC)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className={`slate${refreshing ? " is-refreshing" : ""}`}>
        {games.map((g) => (
          <GameCard key={g.gameId} game={g} />
        ))}
        {games.length === 0 && <p className="muted">No games match {"“"}{query}{"”"}.</p>}
      </div>
      <p className="footnote">
        Spreads read like betting lines: {"“"}KC {"−"}3.5{"”"} means KC is projected to win by 3.5. Bold lines differ from Vegas by 3+ points.
        Win probabilities come from simulated games; ties are rare and not shown.
      </p>
    </>
  );
}
