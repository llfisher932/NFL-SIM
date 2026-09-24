import type { WeekGame } from "../types/sim";
import type { LinePick, PickResult, PickSnapshot, TrackedPick, TrackerLine, TrackerReport } from "../types/tracker";

export const TRACKER_GAPS = [0, 3, 5] as const;

function nthSunday(year: number, month: number, n: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - firstWeekday) % 7) + 7 * (n - 1);
}

function easternDaylightTime(year: number, month: number, day: number): boolean {
  if (month > 3 && month < 11) return true;
  if (month === 3) return day >= nthSunday(year, 3, 2);
  if (month === 11) return day < nthSunday(year, 11, 1);
  return false;
}

// nflverse kickoffs are US Eastern local time, "YYYY-MM-DDTHH:MM".
export function easternToUtc(kickoff: string): Date {
  const [date = "", time = "00:00"] = kickoff.split("T");
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const offset = easternDaylightTime(year, month, day) ? 4 : 5;
  return new Date(Date.UTC(year, month - 1, day, hour + offset, minute));
}

export function hasStarted(game: WeekGame, now: Date): boolean {
  if (game.homeScore !== null) return true;
  return game.kickoff !== null && easternToUtc(game.kickoff).getTime() <= now.getTime();
}

function grade(margin: number): PickResult {
  return margin > 0 ? "win" : margin < 0 ? "loss" : "push";
}

// Picks the side of a line the model favors and grades it. direction is +1 when the model number
// exceeding the line means the first side (home / over).
function linePick(
  model: number,
  line: number | null,
  closingLine: number | null,
  outcome: number | null,
  sides: [string, string],
  started: boolean,
): LinePick | null {
  if (line === null || model === line) return null;
  const direction = model > line ? 1 : -1;
  return {
    side: direction > 0 ? sides[0] : sides[1],
    gap: model - line,
    line,
    closingLine: started ? closingLine : null,
    clv: started && closingLine !== null ? direction * (closingLine - line) : null,
    result: outcome === null ? null : grade(direction * (outcome - line)),
  };
}

// The last snapshot taken before kickoff stands as the pick; the schedule's current line is the
// closing line once the game has started.
export function trackPicks(snapshots: readonly PickSnapshot[], games: readonly WeekGame[], now: Date): TrackedPick[] {
  const latest = new Map<string, PickSnapshot>();
  const gamesById = new Map(games.map((g) => [g.gameId, g]));
  for (const s of snapshots) {
    const game = gamesById.get(s.gameId);
    if (!game) continue;
    if (game.kickoff !== null && new Date(s.capturedAt).getTime() >= easternToUtc(game.kickoff).getTime()) continue;
    const current = latest.get(s.gameId);
    if (!current || s.capturedAt > current.capturedAt) latest.set(s.gameId, s);
  }
  return [...latest.values()]
    .map((s): TrackedPick => {
      const game = gamesById.get(s.gameId)!;
      const started = hasStarted(game, now);
      const final = game.homeScore !== null && game.awayScore !== null ? { home: game.homeScore, away: game.awayScore } : null;
      return {
        gameId: s.gameId,
        season: s.season,
        week: s.week,
        home: s.home,
        away: s.away,
        kickoff: game.kickoff,
        capturedAt: s.capturedAt,
        started,
        modelMargin: s.modelMargin,
        modelTotal: s.modelTotal,
        spread: linePick(s.modelMargin, s.spreadLine, game.spreadLine, final ? final.home - final.away : null, [s.home, s.away], started),
        total: linePick(s.modelTotal, s.totalLine, game.totalLine, final ? final.home + final.away : null, ["over", "under"], started),
        final,
      };
    })
    .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "") || a.gameId.localeCompare(b.gameId));
}

export function summarizeLine(picks: readonly (LinePick | null)[], minGap: number): TrackerLine {
  const chosen = picks.filter((p): p is LinePick => p !== null && Math.abs(p.gap) >= minGap);
  const clvs = chosen.flatMap((p) => (p.clv === null ? [] : [p.clv]));
  return {
    minGap,
    picks: chosen.length,
    wins: chosen.filter((p) => p.result === "win").length,
    losses: chosen.filter((p) => p.result === "loss").length,
    pushes: chosen.filter((p) => p.result === "push").length,
    averageClv: clvs.length === 0 ? null : clvs.reduce((s, c) => s + c, 0) / clvs.length,
  };
}

export function trackerReport(season: number, picks: readonly TrackedPick[]): TrackerReport {
  const own = picks.filter((p) => p.season === season);
  return {
    season,
    spread: TRACKER_GAPS.map((gap) => summarizeLine(own.map((p) => p.spread), gap)),
    total: TRACKER_GAPS.map((gap) => summarizeLine(own.map((p) => p.total), gap)),
    picks: own,
  };
}
