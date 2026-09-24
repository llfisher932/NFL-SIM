import { useMemo, useState } from "react";
import type { DashboardPlayer } from "../../../src/types/dashboard";
import type { StatSummary } from "../../../src/types/players";
import { fixed, pct } from "../lib/format";
import { RangeBar } from "./RangeBar";

type SortKey = "name" | "targets" | "carries" | "receptions" | "recYards" | "rushYards" | "passYards" | "anytimeTd";

interface PlayerTableProps {
  players: readonly DashboardPlayer[];
  colorFor: (player: DashboardPlayer) => string;
  caption: string;
  showTeam?: boolean;
  defaultSort?: SortKey;
  qbFirst?: boolean;
}

const SUMMARY_KEYS = { receptions: "receptions", recYards: "recYards", rushYards: "rushYards", passYards: "passYards" } as const;

function sortValue(p: DashboardPlayer, key: SortKey): number | string {
  switch (key) {
    case "name":
      return p.name;
    case "targets":
      return p.targets;
    case "carries":
      return p.carries;
    case "anytimeTd":
      return p.anytimeTdProb;
    default:
      return p[SUMMARY_KEYS[key]].mean;
  }
}

const volume = (v: number) => (v < 0.05 ? "—" : fixed(v));

export const scrimmageYards = (p: DashboardPlayer) => p.recYards.mean + p.rushYards.mean;

function RangeCell({ summary, max, color, label, digits = 0 }: { summary: StatSummary; max: number; color: string; label: string; digits?: number }) {
  return (
    <div className="range-cell">
      <RangeBar summary={summary} max={max} color={color} label={label} />
      <span className="range-text">
        <b>{fixed(summary.mean, digits)}</b> {fixed(summary.p10, 0)}
        {"–"}
        {fixed(summary.p90, 0)}
      </span>
    </div>
  );
}

export function PlayerTable({ players, colorFor, caption, showTeam = false, defaultSort = "name", qbFirst = true }: PlayerTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: defaultSort, desc: defaultSort !== "name" });
  const rows = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      if (sort.key === "name") {
        return (qbFirst ? Number(b.starterQb) - Number(a.starterQb) : 0) || scrimmageYards(b) - scrimmageYards(a);
      }
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
      return sort.desc ? -cmp : cmp;
    });
    return sorted;
  }, [players, sort, qbFirst]);

  const max = (get: (p: DashboardPlayer) => number) => Math.max(1, ...players.map(get));
  const maxRecYds = max((p) => p.recYards.p90);
  const maxRushYds = max((p) => p.rushYards.p90);
  const maxPassYds = max((p) => (p.starterQb ? p.passYards.p90 : 0));
  const anyQb = players.some((p) => p.starterQb);

  const header = (key: SortKey, label: string, numeric = true) => (
    <th className={numeric ? "num" : undefined} aria-sort={sort.key === key && key !== "name" ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" }))}>
        {label}
      </button>
    </th>
  );

  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {header("name", "Player", false)}
            {header("targets", "Tgt")}
            {header("carries", "Car")}
            {header("receptions", "Rec")}
            {header("recYards", "Rec yds", false)}
            {header("rushYards", "Rush yds", false)}
            {anyQb && header("passYards", "Pass yds", false)}
            {header("anytimeTd", "Any TD")}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const color = colorFor(p);
            return (
              <tr key={p.playerId}>
                <td>
                  <span className="player-cell">
                    <span className="team-dot" style={{ background: color }} aria-hidden="true" />
                    <span>
                      {p.name} <span className="pos">{showTeam ? `${p.team} · ` : ""}{p.position}</span>
                    </span>
                  </span>
                </td>
                <td className="num">{volume(p.targets)}</td>
                <td className="num">{volume(p.carries)}</td>
                <td className="num">
                  {p.targets >= 0.5 ? (
                    <span className="range-text">
                      <b>{fixed(p.receptions.mean)}</b> {fixed(p.receptions.p10, 0)}
                      {"–"}
                      {fixed(p.receptions.p90, 0)}
                    </span>
                  ) : (
                    <span className="muted">{"—"}</span>
                  )}
                </td>
                <td>{p.targets >= 0.5 ? <RangeCell summary={p.recYards} max={maxRecYds} color={color} label={`${p.name} receiving yards`} /> : <span className="muted">{"—"}</span>}</td>
                <td>{p.carries >= 0.5 ? <RangeCell summary={p.rushYards} max={maxRushYds} color={color} label={`${p.name} rushing yards`} /> : <span className="muted">{"—"}</span>}</td>
                {anyQb && (
                  <td>{p.starterQb ? <RangeCell summary={p.passYards} max={maxPassYds} color={color} label={`${p.name} passing yards`} /> : <span className="muted">{"—"}</span>}</td>
                )}
                <td className="num">{pct(p.anytimeTdProb)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
