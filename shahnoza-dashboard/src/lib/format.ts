import { format, parseISO } from "date-fns";

export function formatUsd(value: number | null | undefined, digits = 0): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatUzs(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} so'm`;
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

/** Compact so'm for chart axes/labels: 12 500 000 → "12.5 mln", 3 200 → "3.2K". */
export function formatUzsShort(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mlrd`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mln`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
): string {
  return `${(Number(value ?? 0) * 100).toFixed(digits)}%`;
}

/** value is already a 0..100 percentage. */
export function formatPct100(
  value: number | null | undefined,
  digits = 0,
): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = "dd MMM yyyy",
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  try {
    return format(d, pattern);
  } catch {
    return "—";
  }
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, "dd MMM yyyy, HH:mm");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
