import { useId, useState, type ReactNode } from "react";

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  table: ReactNode;
  legend?: ReactNode;
}

// Every chart ships with a table twin; the toggle swaps them in place.
export function ChartFrame({ title, subtitle, chart, table, legend }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  return (
    <section className="card chart-card" aria-labelledby={titleId}>
      <div className="chart-head">
        <div>
          <h3 id={titleId}>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="link-button" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Chart" : "Table"}
        </button>
      </div>
      {showTable ? <div className="table-wrap">{table}</div> : chart}
      {!showTable && legend}
    </section>
  );
}
