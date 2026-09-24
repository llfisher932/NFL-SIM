export function shrinkRate(
  numerator: number,
  denominator: number,
  prior: number,
  priorWeight: number,
): number {
  return (numerator + priorWeight * prior) / (denominator + priorWeight);
}

export function regressToward(value: number, mean: number, retention: number): number {
  return mean + retention * (value - mean);
}
