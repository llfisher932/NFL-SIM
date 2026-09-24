import { useMemo, useState } from "react";
import type { DashboardGame, DashboardPlayer } from "../../../src/types/dashboard";
import { fixed, pct } from "../lib/format";
import {
  breakEven,
  expectedValue,
  fairAmerican,
  fromHistogram,
  moneylineOutcome,
  parseAmerican,
  poissonOutcome,
  spreadOutcome,
  summaryOutcome,
  tilt,
  totalOutcome,
  type Outcome,
} from "../lib/odds";

type Market = "spread" | "total" | "moneyline" | "prop";
type Side = "home" | "away";
type PropStat = "passYards" | "rushYards" | "recYards" | "receptions" | "passTds" | "interceptions" | "anytimeTd";

const MARKETS: { key: Market; label: string }[] = [
  { key: "spread", label: "Spread" },
  { key: "total", label: "Total" },
  { key: "moneyline", label: "Moneyline" },
  { key: "prop", label: "Player prop" },
];

const PROPS: { key: PropStat; label: string; step: number; applies: (p: DashboardPlayer) => boolean }[] = [
  { key: "passYards", label: "Passing yards", step: 10, applies: (p) => p.position === "QB" && p.passYards.mean > 20 },
  { key: "passTds", label: "Passing TDs", step: 1, applies: (p) => p.position === "QB" && p.passTds > 0.1 },
  { key: "interceptions", label: "Interceptions", step: 1, applies: (p) => p.position === "QB" && p.interceptions > 0.05 },
  { key: "rushYards", label: "Rushing yards", step: 5, applies: (p) => p.carries >= 1 },
  { key: "recYards", label: "Receiving yards", step: 5, applies: (p) => p.targets >= 1 },
  { key: "receptions", label: "Receptions", step: 1, applies: (p) => p.targets >= 1 },
  { key: "anytimeTd", label: "Anytime TD", step: 1, applies: (p) => p.anytimeTdProb > 0.02 },
];

// Most productive players first for each stat.
function projected(p: DashboardPlayer, stat: PropStat): number {
  if (stat === "anytimeTd") return p.anytimeTdProb;
  if (stat === "passTds" || stat === "interceptions") return p.passYards.mean;
  return p[stat].mean;
}

function eligiblePlayers(players: readonly DashboardPlayer[], stat: PropStat): DashboardPlayer[] {
  const spec = PROPS.find((p) => p.key === stat)!;
  return players.filter(spec.applies).sort((a, b) => projected(b, stat) - projected(a, stat));
}

const MINUS = "−";
// Rows either side of the entered line in the alternative-lines table.
const ALT_STEPS = { line: 10, prop: 6 };
const halfPoint = (x: number) => Math.round(x * 2) / 2;
const signedLine = (x: number) => (x === 0 ? "pk" : `${x > 0 ? "+" : MINUS}${Math.abs(x)}`);
const signedMoney = (x: number) => `${x >= 0 ? "+" : MINUS}$${Math.abs(x).toFixed(2)}`;

function parseLine(text: string): number | null {
  const t = text.trim().toLowerCase().replace(MINUS, "-");
  if (t === "pk" || t === "pick" || t === "pickem") return 0;
  const value = Number(t);
  return t === "" || !Number.isFinite(value) ? null : value;
}

function Result({ outcome, raw, odds, note }: { outcome: Outcome; raw: Outcome | null; odds: number | null; note: string }) {
  const ev = odds === null ? null : expectedValue(outcome, odds);
  const decided = outcome.win + outcome.loss;
  return (
    <div className="calc-result" aria-live="polite">
      <div className="calc-figures">
        <div>
          <div className="tile-label">Win</div>
          <div className="tile-value">{pct(outcome.win, 1)}</div>
        </div>
        <div>
          <div className="tile-label">Push</div>
          <div className="tile-value">{pct(outcome.push, 1)}</div>
        </div>
        <div>
          <div className="tile-label">Lose</div>
          <div className="tile-value">{pct(outcome.loss, 1)}</div>
        </div>
        <div>
          <div className="tile-label">Fair price</div>
          <div className="tile-value">{fairAmerican(decided > 0 ? outcome.win / decided : 0)}</div>
        </div>
      </div>
      {odds === null ? (
        <p className="muted">Enter a price like −110 or +145 to see the expected value.</p>
      ) : (
        <p>
          At {odds > 0 ? `+${odds}` : `${MINUS}${-odds}`} you need to win {pct(breakEven(odds), 1)} of decided bets to break even; this bet wins{" "}
          {pct(decided > 0 ? outcome.win / decided : 0, 1)}.{" "}
          <strong className={ev !== null && ev > 0 ? "calc-positive" : undefined}>
            Expected value {signedMoney((ev ?? 0) * 100)} per $100 {ev !== null && ev > 0 ? "(positive)" : "(negative)"}
          </strong>
        </p>
      )}
      <p className="muted calc-note">
        {raw && <>Raw model alone: {pct(raw.win, 1)} to win. </>}
        {note}
      </p>
    </div>
  );
}

function AltTable({ rows, current }: { rows: { line: number; label: string; outcome: Outcome }[]; current: number | null }) {
  return (
    <details className="calc-alt">
      <summary>Alternative lines</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th className="num">Win</th>
              <th className="num">Push</th>
              <th className="num">Fair price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const decided = r.outcome.win + r.outcome.loss;
              return (
                <tr key={r.line} className={r.line === current ? "calc-current" : undefined}>
                  <td>{r.label}</td>
                  <td className="num">{pct(r.outcome.win, 1)}</td>
                  <td className="num">{pct(r.outcome.push, 1)}</td>
                  <td className="num">{fairAmerican(decided > 0 ? r.outcome.win / decided : 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function around(center: number, step: number, steps: number, floor = -Infinity): number[] {
  return Array.from({ length: 2 * steps + 1 }, (_, i) => center + (i - steps) * step).filter((x) => x >= floor);
}

export function BetCalculator({ game }: { game: DashboardGame }) {
  const { home, away } = game;
  const teamOf = (side: Side) => game[side].team;
  const marginWeight = game.vegas.spread === null ? 1 : (game.pricing?.marginWeight ?? 1);
  const totalWeight = game.vegas.total === null ? 1 : (game.pricing?.totalWeight ?? 1);

  const rawMargin = useMemo(() => fromHistogram(game.marginHistogram), [game]);
  const rawTotal = useMemo(() => fromHistogram(game.totalHistogram), [game]);
  const margin = useMemo(
    () => (game.vegas.spread === null ? rawMargin : tilt(rawMargin, marginWeight * game.margin.mean + (1 - marginWeight) * game.vegas.spread)),
    [game, rawMargin, marginWeight],
  );
  const total = useMemo(
    () => (game.vegas.total === null ? rawTotal : tilt(rawTotal, totalWeight * game.total.mean + (1 - totalWeight) * game.vegas.total)),
    [game, rawTotal, totalWeight],
  );

  const vegasHandicap = (side: Side) => (game.vegas.spread === null ? 0 : side === "home" ? -game.vegas.spread : game.vegas.spread);
  const modelSide: Side =
    game.vegas.spread === null ? (game.margin.mean >= 0 ? "home" : "away") : game.margin.mean >= game.vegas.spread ? "home" : "away";

  const [market, setMarket] = useState<Market>("spread");
  const [team, setTeam] = useState<Side>(modelSide);
  const [handicap, setHandicap] = useState(signedLine(vegasHandicap(modelSide)));
  const [totalSide, setTotalSide] = useState<"over" | "under">(game.vegas.total === null || game.total.mean >= game.vegas.total ? "over" : "under");
  const [totalLine, setTotalLine] = useState(String(game.vegas.total ?? halfPoint(game.total.mean)));
  const [odds, setOdds] = useState("-110");
  const [propStat, setPropStat] = useState<PropStat>("passYards");
  const [propSide, setPropSide] = useState<"over" | "under">("over");
  const eligible = eligiblePlayers(game.players, propStat);
  const [playerId, setPlayerId] = useState<string>(eligible[0]?.playerId ?? "");
  const player = eligible.find((p) => p.playerId === playerId) ?? eligible[0];
  const [propLine, setPropLine] = useState<string>("");

  const price = parseAmerican(odds);
  const pricingNote =
    game.vegas.spread === null
      ? "No Vegas line yet, so these are the raw model's odds."
      : `Realistic odds mix ${Math.round(marginWeight * 100)}% model with ${Math.round((1 - marginWeight) * 100)}% Vegas for margins and ${Math.round(totalWeight * 100)}% model for totals: the mix that best predicted 2022${"–"}2025 results for this kind of game. They come from the simulated score distribution, so common margins like 3 and 7 keep their real weight.`;

  const switchTeam = (side: Side) => {
    setTeam(side);
    setHandicap(signedLine(vegasHandicap(side)));
  };
  const switchStat = (stat: PropStat) => {
    setPropStat(stat);
    setPropLine("");
    const next = eligiblePlayers(game.players, stat);
    setPlayerId(next[0]?.playerId ?? "");
  };

  let body: React.ReactNode = null;
  if (market === "spread") {
    const h = parseLine(handicap);
    body = (
      <>
        <div className="calc-controls">
          <div className="segmented" role="group" aria-label="Team">
            {(["away", "home"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={team === s} onClick={() => switchTeam(s)}>
                {teamOf(s)}
              </button>
            ))}
          </div>
          <label>
            Line
            <input type="text" inputMode="decimal" value={handicap} onChange={(e) => setHandicap(e.target.value)} aria-label="Spread line" />
          </label>
          <label>
            Price
            <input type="text" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} aria-label="Price" />
          </label>
        </div>
        {h === null ? (
          <p className="muted">Enter a line like −7, +3.5 or pk.</p>
        ) : (
          <>
            <Result outcome={spreadOutcome(margin, team, h)} raw={spreadOutcome(rawMargin, team, h)} odds={price} note={pricingNote} />
            <AltTable
              current={h}
              rows={around(halfPoint(h), 0.5, ALT_STEPS.line).map((line) => ({ line, label: `${teamOf(team)} ${signedLine(line)}`, outcome: spreadOutcome(margin, team, line) }))}
            />
          </>
        )}
      </>
    );
  } else if (market === "total") {
    const line = parseLine(totalLine);
    body = (
      <>
        <div className="calc-controls">
          <div className="segmented" role="group" aria-label="Over or under">
            {(["over", "under"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={totalSide === s} onClick={() => setTotalSide(s)}>
                {s === "over" ? "Over" : "Under"}
              </button>
            ))}
          </div>
          <label>
            Total
            <input type="text" inputMode="decimal" value={totalLine} onChange={(e) => setTotalLine(e.target.value)} aria-label="Total line" />
          </label>
          <label>
            Price
            <input type="text" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} aria-label="Price" />
          </label>
        </div>
        {line === null ? (
          <p className="muted">Enter a total like 44.5.</p>
        ) : (
          <>
            <Result outcome={totalOutcome(total, totalSide, line)} raw={totalOutcome(rawTotal, totalSide, line)} odds={price} note={pricingNote} />
            <AltTable
              current={line}
              rows={around(halfPoint(line), 0.5, ALT_STEPS.line, 0).map((l) => ({ line: l, label: `${totalSide === "over" ? "Over" : "Under"} ${l}`, outcome: totalOutcome(total, totalSide, l) }))}
            />
          </>
        )}
      </>
    );
  } else if (market === "moneyline") {
    body = (
      <>
        <div className="calc-controls">
          <div className="segmented" role="group" aria-label="Team">
            {(["away", "home"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={team === s} onClick={() => setTeam(s)}>
                {teamOf(s)}
              </button>
            ))}
          </div>
          <label>
            Price
            <input type="text" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} aria-label="Price" />
          </label>
        </div>
        <Result
          outcome={moneylineOutcome(margin, team)}
          raw={moneylineOutcome(rawMargin, team)}
          odds={price}
          note={`A tie counts as a push. ${pricingNote}`}
        />
      </>
    );
  } else {
    const spec = PROPS.find((p) => p.key === propStat)!;
    const defaultLine = (() => {
      if (!player) return 0;
      if (propStat === "anytimeTd") return 0.5;
      if (propStat === "passTds" || propStat === "interceptions") return Math.floor(propStat === "passTds" ? player.passTds : player.interceptions) + 0.5;
      const s = player[propStat];
      return Math.floor(s.p50) + 0.5;
    })();
    const line = propLine === "" ? defaultLine : parseLine(propLine);
    const outcomeAt = (l: number): Outcome | null => {
      if (!player) return null;
      if (propStat === "anytimeTd") {
        const p = player.anytimeTdProb;
        return propSide === "over" ? { win: p, push: 0, loss: 1 - p } : { win: 1 - p, push: 0, loss: p };
      }
      if (propStat === "passTds") return poissonOutcome(player.passTds, propSide, l);
      if (propStat === "interceptions") return poissonOutcome(player.interceptions, propSide, l);
      return summaryOutcome(player[propStat], propSide, l);
    };
    const outcome = line === null ? null : outcomeAt(line);
    body = (
      <>
        <div className="calc-controls">
          <label>
            Stat
            <select value={propStat} onChange={(e) => switchStat(e.target.value as PropStat)} aria-label="Stat">
              {PROPS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Player
            <select value={player?.playerId ?? ""} onChange={(e) => setPlayerId(e.target.value)} aria-label="Player">
              {eligible.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name} ({p.team} {p.position})
                </option>
              ))}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Over or under">
            {(["over", "under"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={propSide === s} onClick={() => setPropSide(s)}>
                {propStat === "anytimeTd" ? (s === "over" ? "Scores" : "Doesn’t") : s === "over" ? "Over" : "Under"}
              </button>
            ))}
          </div>
          {propStat !== "anytimeTd" && (
            <label>
              Line
              <input
                type="text"
                inputMode="decimal"
                value={propLine === "" ? String(defaultLine) : propLine}
                onChange={(e) => setPropLine(e.target.value)}
                aria-label="Prop line"
              />
            </label>
          )}
          <label>
            Price
            <input type="text" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} aria-label="Price" />
          </label>
        </div>
        {!player ? (
          <p className="muted">No projected players for this stat.</p>
        ) : outcome === null || line === null ? (
          <p className="muted">Enter a line like 64.5.</p>
        ) : (
          <>
            <Result
              outcome={outcome}
              raw={null}
              odds={price}
              note={`Model only: there are no prop lines in our data to blend with or check against, so treat prop odds as rougher than game odds. ${
                propStat === "passTds" || propStat === "interceptions" || propStat === "anytimeTd"
                  ? `Projected ${spec.label.toLowerCase()}: ${fixed(propStat === "passTds" ? player.passTds : propStat === "interceptions" ? player.interceptions : player.touchdowns, 2)}.`
                  : `Projected ${spec.label.toLowerCase()}: median ${fixed(player[propStat].p50)}, 80% range ${fixed(player[propStat].p10)}${"–"}${fixed(player[propStat].p90)}.`
              }`}
            />
            {propStat !== "anytimeTd" && (
              <AltTable
                current={line}
                rows={around(line, spec.step, ALT_STEPS.prop, 0).map((l) => ({
                  line: l,
                  label: `${propSide === "over" ? "Over" : "Under"} ${l}`,
                  outcome: outcomeAt(l)!,
                }))}
              />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <section className="card chart-card calc" aria-label="Bet calculator">
      <div className="chart-head">
        <div>
          <h3>Bet calculator</h3>
          <p>
            Pick a bet, enter your sportsbook{"’"}s line and price, and see the realistic chance it wins, its fair price and its expected value.
          </p>
        </div>
      </div>
      <div className="segmented calc-markets" role="group" aria-label="Bet type">
        {MARKETS.map((m) => (
          <button key={m.key} type="button" aria-pressed={market === m.key} onClick={() => setMarket(m.key)}>
            {m.label}
          </button>
        ))}
      </div>
      {body}
      <p className="muted calc-note">
        {away.team} @ {home.team}. Probabilities, not advice: even a positive expected value loses often, and the model{"’"}s edge over Vegas is small.
      </p>
    </section>
  );
}
