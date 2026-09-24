const MINUS = "−";

export function pct(probability: number, digits = 0): string {
  return `${(probability * 100).toFixed(digits)}%`;
}

export function signed(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${value > 0 ? "+" : MINUS}${text}`;
}

export function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

// A home-perspective margin (positive = home ahead) written as a betting-style line.
export function lineLabel(homeMargin: number, home: string, away: string, digits = 1): string {
  const size = Math.abs(homeMargin).toFixed(digits);
  if (Number(size) === 0) return "Pick'em";
  return `${homeMargin > 0 ? home : away} ${MINUS}${size}`;
}

export function marginLabel(homeMargin: number, home: string, away: string): string {
  if (homeMargin === 0) return "Tie";
  return `${homeMargin > 0 ? home : away} by ${Math.abs(homeMargin)}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// nflverse kickoffs are Eastern-time wall clock ("2025-10-05T13:00"); format without timezone math.
export function kickoffLabel(kickoff: string | null): string {
  if (!kickoff) return "TBD";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(kickoff);
  if (!match) return kickoff;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const day = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]!;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${day}, ${MONTHS[mo - 1]} ${d} · ${hour12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} ET`;
}

export function generatedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const GROUP_LABELS: Record<string, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  OL: "OL",
  DL: "DL",
  LB: "LB",
  DB: "DB",
};
