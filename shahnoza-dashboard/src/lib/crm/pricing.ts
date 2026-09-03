import type { CrmActiveWindow, CrmPriceConfig, Tarif } from "@/types/crm";
import { crmAdmin } from "./db";

export type PriceWindow = {
  narx: number;
  eski_narx: number | null;
  chegirma_foiz: number | null;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function priceForTarif(
  row: Record<string, unknown> | null | undefined,
  tarif: Tarif,
): number | null {
  if (!row) return null;
  const direct = asNumber(row.narx);
  if (row.tarif === tarif && direct != null) return direct;
  if (direct != null && row.tarif == null) return direct;

  const column =
    tarif === "BAZA" ? "baza" : tarif === "KASB" ? "kasb" : tarif === "BIZNES" ? "biznes" : null;
  if (!column) return null;
  return asNumber(row[column]);
}

function pickRow(
  rows: Record<string, unknown>[] | null,
  tarif: Tarif,
): Record<string, unknown> | null {
  if (!rows?.length) return null;
  return rows.find((r) => r.tarif === tarif) ?? rows[0] ?? null;
}

export async function getPriceWindow(
  cohortId: string,
  tarif: Tarif,
): Promise<PriceWindow> {
  const db = crmAdmin();

  const { data: windowRows, error: windowError } = await db
    .from("crm_active_window")
    .select("*")
    .eq("cohort_id", cohortId);

  if (windowError) throw new Error(windowError.message);

  const windowRow = pickRow(
    (windowRows ?? []) as Record<string, unknown>[],
    tarif,
  ) as (CrmActiveWindow & Record<string, unknown>) | null;

  const { data: configRows, error: configError } = await db
    .from("crm_price_config")
    .select("*")
    .eq("cohort_id", cohortId);

  if (configError) throw new Error(configError.message);

  const configRow = pickRow(
    (configRows ?? []) as Record<string, unknown>[],
    tarif,
  ) as (CrmPriceConfig & Record<string, unknown>) | null;

  const base = priceForTarif(configRow, tarif);
  const windowPrice = priceForTarif(windowRow, tarif);

  if (!windowRow || windowPrice == null) {
    if (base == null) {
      throw new Error(`Narx topilmadi: cohort=${cohortId} tarif=${tarif}`);
    }
    return { narx: base, eski_narx: null, chegirma_foiz: null };
  }

  const eskiFromWindow = asNumber(windowRow.eski_narx);
  const eski_narx = eskiFromWindow ?? (base != null && base !== windowPrice ? base : null);
  const chegirmaFromWindow = asNumber(windowRow.chegirma_foiz);
  const chegirma_foiz =
    chegirmaFromWindow ??
    (eski_narx != null && eski_narx > 0
      ? Math.round((1 - windowPrice / eski_narx) * 100)
      : null);

  return { narx: windowPrice, eski_narx, chegirma_foiz };
}

/** Base tarif price from crm_price_config (no active-window overlay). */
export function configNarxForTarif(
  rows: Record<string, unknown>[] | null | undefined,
  cohortId: string | null | undefined,
  tarif: Tarif,
): number | null {
  if (!cohortId || !rows?.length) return null;
  const scoped = rows.filter((r) => r.cohort_id === cohortId);
  const row = pickRow(scoped.length ? scoped : rows, tarif);
  return priceForTarif(row, tarif);
}

export async function getConfigNarx(
  cohortId: string | null | undefined,
  tarif: Tarif,
): Promise<number | null> {
  if (!cohortId) return null;
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_price_config")
    .select("*")
    .eq("cohort_id", cohortId);
  if (error) throw new Error(error.message);
  return configNarxForTarif(
    (data ?? []) as Record<string, unknown>[],
    cohortId,
    tarif,
  );
}

export async function fetchPriceConfigByCohorts(
  cohortIds: string[],
): Promise<Record<string, unknown>[]> {
  if (cohortIds.length === 0) return [];
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_price_config")
    .select("*")
    .in("cohort_id", cohortIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}
