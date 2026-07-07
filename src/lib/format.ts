/** All displayed numbers are rounded (per spec). */
export function rnd(n: number): number {
  return Math.round(n);
}

export function fmtKcal(n: number): string {
  return `${rnd(n).toLocaleString('en-US').replace(/,/g, ' ')}`;
}

export function fmtG(n: number): string {
  return `${rnd(n)} g`;
}

export function fmtKg(n: number): string {
  // Weight is the one place a decimal matters (85.4 kg), still tidy.
  return `${Math.round(n * 10) / 10} kg`;
}

export function fmtSigned(n: number): string {
  const r = rnd(n);
  return r > 0 ? `+${r}` : `${r}`;
}
