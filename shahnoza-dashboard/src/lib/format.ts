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
