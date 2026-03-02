export function manwonToWon(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000);
}

export function toWonFromManwon(values: number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value))
    .map((value) => manwonToWon(value));
}
