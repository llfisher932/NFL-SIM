import type { DashboardRecord } from "../../../src/types/dashboard";
import type { HitRate, ScoreCard } from "../../../src/types/eval";
import { fixed, generatedLabel, pct } from "../lib/format";
import { CalibrationChart } from "./CalibrationChart";
import { ChartFrame } from "./ChartFrame";

const hitRate = (h: HitRate) => (h.decisions === 0 ? "—" : pct(h.hits / h.decisions, 1));

function Tile({ label, model, market, digits, note }: { label: string; model: number; market: number; digits: number; note: string }) {
  const better = model <= market;
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{fixed(model, digits)}</div>
      <div className="tile-sub">
        Market {fixed(market, digits)} {"·"} {better ? "model ahead" : `${fixed(model - market, digits)} behind`}
      </div>
      <div className="tile-sub muted">{note}</div>
    </div>
  );
}

export function RecordView({ record }: { record: DashboardRecord }) {
  const all = record.seasons.find((s) => s.season === "all");
  const seasons = record.seasons.filter((s) => s.season !== "all");
  if (!all) return <p className="muted">No backtest results.</p>;
  const cell = (card: ScoreCard, key: keyof ScoreCard, digits: number) => fixed(card[key], digits);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Model record</h1>
          <p className="page-meta">
            Walk-forward backtest over {all.model.games.toLocaleString()} games: each week predicted using only earlier data {"·"} market = de-vigged
            moneyline, closing spread and total {"·"} generated {generatedLabel(record.generatedAt)}
          </p>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Brier score (win probability)" model={all.model.brier} market={all.market.brier} digits={4} note="Lower is better" />
        <Tile label="Log loss" model={all.model.logLoss} market={all.market.logLoss} digits={4} note="Lower is better" />
        <Tile label="Margin error (points)" model={all.model.marginMae} market={all.market.marginMae} digits={2} note="Mean absolute error" />
        <Tile label="Total error (points)" model={all.model.totalMae} market={all.market.totalMae} digits={2} note="Mean absolute error" />
        <div className="card tile">
          <div className="tile-label">Against the spread</div>
          <div className="tile-value">{hitRate(all.againstSpread)}</div>
          <div className="tile-sub">Break-even at standard odds is 52.4%</div>
          <div className="tile-sub muted">Over/under {hitRate(all.overUnder)}</div>
        </div>
      </div>

      <div className="two-col">
        <ChartFrame
          title="Calibration"
          subtitle="When the model says 70%, does the home team win about 70% of the time?"
          chart={
            <CalibrationChart
              series={[
                { name: "Model", color: "var(--away)", buckets: record.calibration.model },
                { name: "Market", color: "var(--neutral)", buckets: record.calibration.market },
              ]}
            />
          }
          legend={
            <div className="legend">
              <span>
                <i className="line" style={{ background: "var(--away)" }} /> Model
              </span>
              <span>
                <i className="line" style={{ background: "var(--neutral)" }} /> Market
              </span>
            </div>
          }
          table={
            <table>
              <caption className="visually-hidden">Calibration by predicted probability bucket</caption>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th className="num">Model games</th>
                  <th className="num">Model predicted</th>
                  <th className="num">Model actual</th>
                  <th className="num">Market games</th>
                  <th className="num">Market predicted</th>
                  <th className="num">Market actual</th>
                </tr>
              </thead>
              <tbody>
                {record.calibration.model.map((m, i) => {
                  const k = record.calibration.market[i]!;
                  const p = (v: number, n: number) => (n === 0 ? "—" : pct(v, 1));
                  return (
                    <tr key={m.lower}>
                      <td>
                        {pct(m.lower)}
                        {"–"}
                        {pct(m.upper)}
                      </td>
                      <td className="num">{m.games}</td>
                      <td className="num">{p(m.meanPredicted, m.games)}</td>
                      <td className="num">{p(m.actualRate, m.games)}</td>
                      <td className="num">{k.games}</td>
                      <td className="num">{p(k.meanPredicted, k.games)}</td>
                      <td className="num">{p(k.actualRate, k.games)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        />
        <section className="card chart-card">
          <div className="chart-head">
            <div>
              <h3>By season</h3>
              <p>Model first, market second in each column</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th className="num">Games</th>
                  <th className="num">Brier</th>
                  <th className="num">Log loss</th>
                  <th className="num">Margin err</th>
                  <th className="num">ATS</th>
                </tr>
              </thead>
              <tbody>
                {[...seasons, all].map((s) => (
                  <tr key={String(s.season)}>
                    <td>{s.season === "all" ? <strong>All</strong> : s.season}</td>
                    <td className="num">{s.model.games}</td>
                    <td className="num">
                      {cell(s.model, "brier", 3)} <span className="muted">/ {cell(s.market, "brier", 3)}</span>
                    </td>
                    <td className="num">
                      {cell(s.model, "logLoss", 3)} <span className="muted">/ {cell(s.market, "logLoss", 3)}</span>
                    </td>
                    <td className="num">
                      {cell(s.model, "marginMae", 2)} <span className="muted">/ {cell(s.market, "marginMae", 2)}</span>
                    </td>
                    <td className="num">{hitRate(s.againstSpread)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
