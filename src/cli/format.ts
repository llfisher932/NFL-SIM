export type Cell = string | number;

const NUMERIC = /^[+-]?\d[\d,]*(\.\d+)?%?$/;

export function formatTable(headers: readonly string[], rows: readonly Cell[][]): string {
  const text = rows.map((row) => row.map(String));
  const widths = headers.map((h, i) => Math.max(h.length, ...text.map((row) => row[i]?.length ?? 0)));
  const numeric = headers.map((_, i) => text.length > 0 && text.every((row) => NUMERIC.test(row[i] ?? "")));
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, i) => (numeric[i] ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...text.map(line)].join("\n");
}

export const fixed = (value: number, digits = 3) => value.toFixed(digits);
