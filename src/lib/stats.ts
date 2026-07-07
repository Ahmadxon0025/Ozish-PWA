import { db } from '../db/db';
import type { LogEntry, Settings, WeightEntry } from '../types';
import { dayMaintenance } from './calc';
import { addDays, lastNDates, monthKey, todayISO, weekStart, yearKey } from './dates';
import { latestWeightKg } from './repo';

// ─────────────────────────────────────────────────────────────────────────────
// Aggregations for Trends, streaks and the weekly summary.
// ─────────────────────────────────────────────────────────────────────────────

export interface DayStat {
  date: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  logged: boolean;
  maintenance: number;
}

/** A day counts as "on target" when it was logged and calories ≤ target (+2% grace). */
export function isOnTarget(stat: DayStat, targetKcal: number): boolean {
  return stat.logged && stat.kcal <= targetKcal * 1.02;
}

export async function dayStats(dates: string[], settings: Settings): Promise<DayStat[]> {
  const [entries, stepsRows, weight] = await Promise.all([
    db.entries.where('date').anyOf(dates).toArray(),
    db.steps.where('date').anyOf(dates).toArray(),
    latestWeightKg(),
  ]);
  const stepsByDate = new Map(stepsRows.map((s) => [s.date, s.steps]));
  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }
  const w = weight ?? settings.startWeightKg;
  return dates.map((date) => {
    const list = byDate.get(date) ?? [];
    const kcal = list.reduce((n, e) => n + e.kcal, 0);
    return {
      date,
      kcal,
      p: list.reduce((n, e) => n + e.p, 0),
      f: list.reduce((n, e) => n + e.f, 0),
      c: list.reduce((n, e) => n + e.c, 0),
      logged: list.length > 0,
      maintenance: dayMaintenance(settings, stepsByDate.get(date), w),
    };
  });
}

export interface PeriodStat {
  label: string;
  kcal: number; // average across logged days
  p: number;
  maintenance: number;
  loggedDays: number;
}

export function groupByPeriod(
  stats: DayStat[],
  mode: 'week' | 'month' | 'year',
): PeriodStat[] {
  const keyFn = mode === 'week' ? weekStart : mode === 'month' ? monthKey : yearKey;
  const groups = new Map<string, DayStat[]>();
  for (const s of stats) {
    const k = keyFn(s.date);
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, list]) => {
      const logged = list.filter((s) => s.logged);
      const n = Math.max(1, logged.length);
      return {
        label,
        kcal: logged.reduce((x, s) => x + s.kcal, 0) / n,
        p: logged.reduce((x, s) => x + s.p, 0) / n,
        maintenance: list.reduce((x, s) => x + s.maintenance, 0) / list.length,
        loggedDays: logged.length,
      };
    });
}

export interface SummaryStats {
  avgKcal: number;
  avgP: number;
  daysOnTarget: number;
  loggedDays: number;
  totalDays: number;
  /** Sum over logged days of (maintenance − eaten), only when positive. */
  accumulatedDeficit: number;
  estFatLossKg: number;
}

export function summarize(stats: DayStat[], settings: Settings): SummaryStats {
  const logged = stats.filter((s) => s.logged);
  const n = Math.max(1, logged.length);
  const deficit = logged.reduce((sum, s) => sum + Math.max(0, s.maintenance - s.kcal), 0);
  return {
    avgKcal: logged.reduce((x, s) => x + s.kcal, 0) / n,
    avgP: logged.reduce((x, s) => x + s.p, 0) / n,
    daysOnTarget: stats.filter((s) => isOnTarget(s, settings.targetKcal)).length,
    loggedDays: logged.length,
    totalDays: stats.length,
    accumulatedDeficit: deficit,
    estFatLossKg: deficit / 7700,
  };
}

/** Consecutive on-target days ending today or yesterday. */
export async function currentStreak(settings: Settings): Promise<number> {
  const dates = lastNDates(120);
  const stats = await dayStats(dates, settings);
  const byDate = new Map(stats.map((s) => [s.date, s]));
  let streak = 0;
  let cursor = todayISO();
  // Today only counts if already on target; otherwise start from yesterday.
  const today = byDate.get(cursor);
  if (today && isOnTarget(today, settings.targetKcal)) streak++;
  cursor = addDays(cursor, -1);
  while (true) {
    const s = byDate.get(cursor);
    if (!s || !isOnTarget(s, settings.targetKcal)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface WeeklySummary {
  weekStartISO: string;
  avgKcal: number;
  proteinHitRate: number; // 0..1 of logged days with P ≥ 90% target
  weightChangeKg?: number;
  daysLogged: number;
  daysOnTarget: number;
}

export async function weeklySummary(settings: Settings): Promise<WeeklySummary> {
  const start = weekStart(todayISO());
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (d <= todayISO()) dates.push(d);
  }
  const stats = await dayStats(dates, settings);
  const logged = stats.filter((s) => s.logged);
  const hit = logged.filter((s) => s.p >= settings.targetP * 0.9).length;

  const weights: WeightEntry[] = await db.weights.orderBy('date').toArray();
  const inWeek = weights.filter((w) => w.date >= start && w.date <= todayISO());
  const before = weights.filter((w) => w.date < start);
  let weightChangeKg: number | undefined;
  if (inWeek.length > 0 && before.length > 0) {
    weightChangeKg = inWeek[inWeek.length - 1].kg - before[before.length - 1].kg;
  } else if (inWeek.length >= 2) {
    weightChangeKg = inWeek[inWeek.length - 1].kg - inWeek[0].kg;
  }

  return {
    weekStartISO: start,
    avgKcal: logged.length ? logged.reduce((x, s) => x + s.kcal, 0) / logged.length : 0,
    proteinHitRate: logged.length ? hit / logged.length : 0,
    weightChangeKg,
    daysLogged: logged.length,
    daysOnTarget: stats.filter((s) => isOnTarget(s, settings.targetKcal)).length,
  };
}

export function shareableWeeklyText(s: WeeklySummary, settings: Settings): string {
  const lines = [
    `📊 Haftalik hisobot (${s.weekStartISO} dan)`,
    `• O'rtacha kaloriya: ${Math.round(s.avgKcal)} / ${settings.targetKcal} kkal`,
    `• Protein bajarilishi: ${Math.round(s.proteinHitRate * 100)}%`,
    `• Yozilgan kunlar: ${s.daysLogged}/7`,
    `• Maqsadda: ${s.daysOnTarget} kun`,
  ];
  if (s.weightChangeKg !== undefined) {
    const v = Math.round(s.weightChangeKg * 10) / 10;
    lines.push(`• Vazn o'zgarishi: ${v > 0 ? '+' : ''}${v} kg`);
  }
  lines.push('— Ozish PWA');
  return lines.join('\n');
}
