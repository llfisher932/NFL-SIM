import { pct } from "../lib/format";

interface WinBarProps {
  away: string;
  home: string;
  awayProb: number;
  homeProb: number;
  large?: boolean;
}

// Two-segment win-probability bar; the numbers live in adjacent text, never inside the bar.
export function WinBar({ away, home, awayProb, homeProb, large = false }: WinBarProps) {
  const total = awayProb + homeProb || 1;
  return (
    <div
      className={`winbar${large ? " large" : ""}`}
      role="img"
      aria-label={`Win probability: ${away} ${pct(awayProb)}, ${home} ${pct(homeProb)}`}
    >
      <span className="away" style={{ flexBasis: `${(awayProb / total) * 100}%` }} />
      <span className="home" style={{ flexBasis: `${(homeProb / total) * 100}%` }} />
    </div>
  );
}
