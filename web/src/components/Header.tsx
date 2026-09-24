import type { DashboardIndexEntry } from "../../../src/types/dashboard";
import { formatHash, type Route } from "../lib/route";
import type { ThemeChoice } from "../lib/theme";

interface HeaderProps {
  route: Route;
  weeks: readonly DashboardIndexEntry[];
  selected: DashboardIndexEntry | null;
  hasRecord: boolean;
  theme: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
}

const THEMES: { key: ThemeChoice; label: string }[] = [
  { key: "system", label: "Auto" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export function Header({ route, weeks, selected, hasRecord, theme, onTheme }: HeaderProps) {
  const weekRoute = (view: "slate" | "players"): Route | null =>
    selected ? { view, season: selected.season, week: selected.week } : null;
  const current = route.view === "game" ? "slate" : route.view;
  const slate = weekRoute("slate");
  const players = weekRoute("players");

  function onWeek(value: string) {
    const [season, week] = value.split("-").map(Number) as [number, number];
    const view = route.view === "players" ? "players" : "slate";
    window.location.hash = formatHash({ view, season, week });
  }

  return (
    <header className="site-header">
      <div className="container header-row">
        <a className="brand" href={slate ? formatHash(slate) : "#/"}>
          <span className="brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M2 11h12M2 8h12M2 5h12" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          Gridiron Sim
        </a>
        <nav className="nav" aria-label="Views">
          {slate && (
            <a href={formatHash(slate)} aria-current={current === "slate" ? "page" : undefined}>
              Slate
            </a>
          )}
          {players && (
            <a href={formatHash(players)} aria-current={current === "players" ? "page" : undefined}>
              Players
            </a>
          )}
          {hasRecord && (
            <a href={formatHash({ view: "record" })} aria-current={current === "record" ? "page" : undefined}>
              Model record
            </a>
          )}
        </nav>
        <div className="header-tools">
          {weeks.length > 0 && (
            <label>
              <span className="visually-hidden">Week</span>
              <select value={selected ? `${selected.season}-${selected.week}` : ""} onChange={(e) => onWeek(e.target.value)}>
                {weeks.map((w) => (
                  <option key={`${w.season}-${w.week}`} value={`${w.season}-${w.week}`}>
                    {w.season} {"·"} Week {w.week}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="segmented" role="group" aria-label="Color theme">
            {THEMES.map((t) => (
              <button key={t.key} type="button" aria-pressed={theme === t.key} onClick={() => onTheme(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
