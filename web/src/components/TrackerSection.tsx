import type { LinePick, TrackedPick, TrackerLine, TrackerReport } from "../../../src/types/tracker";
import { fixed, kickoffLabel, pct } from "../lib/format";

const BREAK_EVEN = 0.524;
const RECENT_PICKS = 24;

const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fixed(Math.abs(value), digits)}`;

function record(line: TrackerLine): string {
  const decided = line.wins + line.losses;
  const base = `${line.wins}–${line.losses}${line.pushes > 0 ? `–${line.pushes}` : ""}`;
  return decided === 0 ? base : `${base} (${pct(line.wins / decided, 1)})`;
}

function LineTile({ title, lines }: { title: string; lines: TrackerLine[] }) {
  const [all, ...strong] = lines;
  if (!all) return null;
  return (
    <div className="card tile">
      <div className="tile-label">{title}</div>
      <div className="tile-value">{record(all)}</div>
      {strong.map((l) => (
        <div className="tile-sub" key={l.minGap}>
          {l.minGap}+ pt disagreements: {record(l)}
        </div>
      ))}
      <div className="tile-sub muted">
        Closing line value {all.averageClv === null ? "—" : `${signed(all.averageClv, 2)} pts`} {"·"} break-even {pct(BREAK_EVEN, 1)}
      </div>
    </div>
  );
}

function pickLabel(pick: LinePick | null, kind: "spread" | "total"): string {
  if (!pick) return "—";
  if (kind === "total") return `${pick.side === "over" ? "Over" : "Under"} ${fixed(pick.line)}`;
  return pick.side;
}

function resultLabel(pick: LinePick | null): string {
  if (!pick?.result) return "—";
  return pick.result === "win" ? "Won" : pick.result === "loss" ? "Lost" : "Push";
}

function PickRow({ pick }: { pick: TrackedPick }) {
  const spread = pick.spread;
  return (
    <tr>
      <td>
        {pick.away} @ {pick.home}
        <div className="muted">{pick.kickoff ? kickoffLabel(pick.kickoff) : `Week ${pick.week}`}</div>
      </td>
      <td>
        {spread ? `${pickLabel(spread, "spread")} (${signed(Math.abs(spread.gap))} vs line)` : "—"}
        <div className="muted">
          Model {signed(pick.modelMargin)} {"·"} line {spread ? signed(spread.line) : "—"}
        </div>
      </td>
      <td className="num">{spread?.closingLine === null || !spread ? "—" : signed(spread.closingLine)}</td>
      <td className="num">{spread?.clv === null || !spread ? "—" : signed(spread.clv)}</td>
      <td>{resultLabel(spread)}</td>
      <td>
        {pickLabel(pick.total, "total")} <span className="muted">{resultLabel(pick.total)}</span>
      </td>
    </tr>
  );
}

export function TrackerSection({ tracker }: { tracker: TrackerReport }) {
  const recent = [...tracker.picks].reverse().slice(0, RECENT_PICKS);
  return (
    <section className="tracker">
      <div className="page-head">
        <div>
          <h2>{tracker.season} live picks</h2>
          <p className="page-meta">
            Logged at each refresh before kickoff and graded against that line, so nothing here can be fitted after the fact {"·"} lines are
            home margins (+ = home favored) {"·"} closing line value = points the line moved toward the model by kickoff
          </p>
        </div>
      </div>
      {tracker.picks.length === 0 ? (
        <p className="muted">No picks logged yet. The next refresh before kickoff starts the record.</p>
      ) : (
        <>
          <div className="tiles">
            <LineTile title="Against the spread" lines={tracker.spread} />
            <LineTile title="Over/under" lines={tracker.total} />
          </div>
          <section className="card chart-card">
            <div className="chart-head">
              <div>
                <h3>Recent picks</h3>
                <p>The model's side of each line, newest first</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Spread pick</th>
                    <th className="num">Closing line</th>
                    <th className="num">CLV</th>
                    <th>Result</th>
                    <th>Total pick</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <PickRow key={p.gameId} pick={p} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
