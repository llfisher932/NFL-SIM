import { useEffect, useState } from "react";
import type { DashboardIndexEntry } from "../../src/types/dashboard";
import { GameDetail } from "./components/GameDetail";
import { Header } from "./components/Header";
import { PlayersView } from "./components/PlayersView";
import { RecordView } from "./components/RecordView";
import { Slate } from "./components/Slate";
import { useIndex, useRecord, useWeek } from "./lib/data";
import { formatHash, parseHash, type Route } from "./lib/route";
import { useTheme } from "./lib/theme";

function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card notice">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  const route = useHashRoute();
  const [theme, setTheme] = useTheme();
  const index = useIndex();
  const weeks = index.data?.weeks ?? [];

  const selected: DashboardIndexEntry | null =
    route.view === "slate" || route.view === "players" || route.view === "game"
      ? (weeks.find((w) => w.season === route.season && w.week === route.week) ?? null)
      : (weeks[0] ?? null);

  useEffect(() => {
    const latest = weeks[0];
    if (route.view === "home" && latest) {
      window.location.replace(formatHash({ view: "slate", season: latest.season, week: latest.week }));
    }
  }, [route, weeks]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.view, route.view === "game" ? route.gameId : null]);

  const week = useWeek(route.view === "record" ? null : (selected?.file ?? null));
  const record = useRecord(route.view === "record" ? (index.data?.record ?? null) : null);
  const refreshing = week.loading && week.data !== null;

  function content() {
    if (index.error && !index.data) {
      return (
        <Notice title="No projections yet">
          <p>
            Generate a week of projections, then reload: <code>pnpm export --season 2025 --weeks 5</code>
          </p>
          <p className="muted">The dashboard reads JSON from web/public/data ({index.error}).</p>
        </Notice>
      );
    }
    if (!index.data) return <p className="muted">Loading{"…"}</p>;
    if (route.view === "record") {
      if (!index.data.record) {
        return (
          <Notice title="No model record">
            <p>
              Run <code>pnpm backtest</code> and then <code>pnpm export</code> again to publish the backtest.
            </p>
          </Notice>
        );
      }
      return record.data ? <RecordView record={record.data} /> : <p className="muted">{record.error ?? "Loading…"}</p>;
    }
    if (weeks.length === 0) {
      return (
        <Notice title="No weeks exported">
          <p>
            Run <code>pnpm export --season 2025 --weeks 5</code>.
          </p>
        </Notice>
      );
    }
    if (!selected && route.view !== "home") {
      return (
        <Notice title="That week has not been exported">
          <p>Pick another week above, or generate it with the export command.</p>
        </Notice>
      );
    }
    if (week.error && !week.data) return <Notice title="Could not load this week">{week.error}</Notice>;
    if (!week.data || (selected && (week.data.season !== selected.season || week.data.week !== selected.week) && !refreshing)) {
      return <p className="muted">Loading{"…"}</p>;
    }
    if (route.view === "players") return <PlayersView week={week.data} refreshing={refreshing} />;
    if (route.view === "game") {
      const game = week.data.games.find((g) => g.gameId === route.gameId);
      return game ? (
        <GameDetail game={game} />
      ) : (
        <Notice title="Game not found">
          <p>It may belong to a different week.</p>
        </Notice>
      );
    }
    return <Slate week={week.data} refreshing={refreshing} />;
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header route={route} weeks={weeks} selected={selected} hasRecord={Boolean(index.data?.record)} theme={theme} onTheme={setTheme} />
      <main id="main" className="container">
        {content()}
      </main>
    </>
  );
}
