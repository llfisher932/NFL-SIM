export function impliedProbability(americanOdds: number): number {
  if (americanOdds === 0 || Math.abs(americanOdds) < 100) throw new Error(`invalid odds: ${americanOdds}`);
  return americanOdds < 0 ? -americanOdds / (-americanOdds + 100) : 100 / (americanOdds + 100);
}

// Removes the bookmaker margin by normalizing both sides' implied probabilities to sum to one.
export function devigHomeWinProbability(homeMoneyline: number, awayMoneyline: number): number {
  const home = impliedProbability(homeMoneyline);
  const away = impliedProbability(awayMoneyline);
  return home / (home + away);
}
