import type { SituationRecord } from "../../../src/types/situations";
import { fixed, pct } from "../lib/format";
import { BREAK_EVEN, recordLabel } from "../lib/spots";

// Margins within a tenth of a point of Vegas read as even.
const EVEN_WITHIN = 0.1;

const signed = (value: number, digits: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fixed(Math.abs(value), digits)}`;

function accuracy(s: SituationRecord): string {
  const edge = s.market === "spread" ? s.marginEdge : s.totalEdge;
  if (edge === null) return "—";
  const verdict = s.beatsVegas ? "beats Vegas" : Math.abs(edge) < EVEN_WITHIN ? "about even" : edge > 0 ? "model closer" : "Vegas better";
  return `${signed(edge, 2)} pts (${verdict})`;
}

export function SituationsSection({ situations, season }: { situations: SituationRecord[]; season: number | null }) {
  const better = situations.filter((s) => s.beatsVegas);
  const first = Math.min(...situations.map((s) => s.firstSeason ?? Infinity));
  const last = Math.max(...situations.map((s) => s.lastSeason ?? -Infinity));
  const range = Number.isFinite(first) && Number.isFinite(last) ? `${first}${"–"}${last}` : "backtest";
  return (
    <section className="card chart-card situations">
      <div className="chart-head">
        <div>
          <h3>Situations tracked</h3>
          <p>
            {better.length > 0
              ? `More accurate than Vegas: ${better.map((s) => s.label.toLowerCase()).join(", ")}. `
              : "Vegas is more accurate in every situation below. "}
            Records cover the {range} walk-forward backtest. These situations were first picked from 2022{"–"}2025 results, so the earlier seasons
            are an honest check; a situation is only flagged on the slate when it beats the {pct(BREAK_EVEN, 1)} break-even overall and in most
            seasons.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Situation</th>
              <th className="num">Backtest</th>
              <th className="num">Seasons above break-even</th>
              <th className="num">Accuracy vs Vegas</th>
              <th className="num">{season ?? "This season"} live</th>
            </tr>
          </thead>
          <tbody>
            {situations.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.label}</strong>
                  <div className="muted">{s.description}</div>
                </td>
                <td className="num">{recordLabel(s)}</td>
                <td className="num">
                  {s.seasonsAboveBreakEven} of {s.seasons.length}
                </td>
                <td className="num">{accuracy(s)}</td>
                <td className="num">{s.live.picks === 0 ? "—" : `${recordLabel(s.live)}${s.live.picks > s.live.wins + s.live.losses + s.live.pushes ? ` · ${s.live.picks} logged` : ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
