import { endOfISOWeek, format, startOfISOWeek } from "date-fns";
import { NextResponse } from "next/server";
import {
  ALL_STAGES,
  CLOSED_STAGES,
  MANBA_OPTIONS,
  STUDENT_STAGES,
  TARIF_OPTIONS,
} from "@/lib/crm/constants";
import { crmAdmin } from "@/lib/crm/db";
import { todayRange } from "@/lib/dates";

export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  bosqich: string;
  manba: string;
  tarif: string;
  yaratilgan: string;
  narx: unknown;
  to_liq_status?: string | null;
  bosqich_updated_at: string | null;
};

type PaymentRow = {
  lead_id: string | null;
  student_id: string | null;
  amount: unknown;
  status: string;
  created_at: string;
};

type StudentRow = {
  id: string;
  lead_id: string | null;
  stage: string;
};

type CloserRow = {
  id: string;
  name: string;
  closer_level: string | null;
};

type WeeklyRow = {
  closer_id: string;
  connected?: number | null;
  dials?: number | null;
  yutuq?: number | null;
};

type AssignRow = {
  lead_id: string;
  sotuvchi_id: string;
};

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function pct(num: number, den: number): number {
  if (!(den > 0)) return 0;
  return round1((num / den) * 100);
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function zeros(keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = 0;
  return out;
}

function isoWeekBounds(now = new Date()): { weekStart: string; from: string; to: string } {
  const start = startOfISOWeek(now);
  const end = endOfISOWeek(now);
  return {
    weekStart: format(start, "yyyy-MM-dd"),
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function inHalfOpen(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  return iso >= from && iso < to;
}

function inClosed(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  return iso >= from && iso <= to;
}

export async function GET() {
  try {
    const db = crmAdmin();
    const today = todayRange();
    const week = isoWeekBounds();

    const leadSelectWithQarz =
      "id, bosqich, manba, tarif, yaratilgan, narx, to_liq_status, bosqich_updated_at";
    const leadSelectPlain =
      "id, bosqich, manba, tarif, yaratilgan, narx, bosqich_updated_at";

    const [
      leadsFirst,
      paymentsRes,
      studentsRes,
      closersRes,
      levelsRes,
      weeklyRes,
      assignRes,
    ] = await Promise.all([
      db.from("crm_leads").select(leadSelectWithQarz),
      db.from("crm_payments").select("lead_id, student_id, amount, status, created_at"),
      db.from("crm_students").select("id, lead_id, stage"),
      db.from("crm_users").select("id, name, closer_level").eq("role", "closer"),
      db.from("crm_closer_levels").select("level, commission"),
      db.from("crm_weekly_stats").select("*").eq("week_start", week.weekStart),
      db.from("crm_lead_sotuvchi").select("lead_id, sotuvchi_id").eq("birlamchi", true),
    ]);

    let leadsRes = leadsFirst;
    if (leadsRes.error && /to_liq_status|column|schema cache/i.test(leadsRes.error.message ?? "")) {
      leadsRes = await db.from("crm_leads").select(leadSelectPlain);
    }

    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (paymentsRes.error) throw new Error(paymentsRes.error.message);
    if (studentsRes.error) throw new Error(studentsRes.error.message);
    if (closersRes.error) throw new Error(closersRes.error.message);
    if (levelsRes.error) throw new Error(levelsRes.error.message);
    if (weeklyRes.error) throw new Error(weeklyRes.error.message);
    if (assignRes.error) throw new Error(assignRes.error.message);

    const leads = (leadsRes.data ?? []) as LeadRow[];
    const payments = (paymentsRes.data ?? []) as PaymentRow[];
    const students = (studentsRes.data ?? []) as StudentRow[];
    const closers = (closersRes.data ?? []) as CloserRow[];
    const levels = (levelsRes.data ?? []) as { level: string; commission: unknown }[];
    const weekly = (weeklyRes.data ?? []) as WeeklyRow[];
    const assigns = (assignRes.data ?? []) as AssignRow[];

    const byBosqich = zeros(ALL_STAGES);
    const byManba = zeros(MANBA_OPTIONS);
    const byTarif = zeros(TARIF_OPTIONS);
    const byManbaYutuq = zeros(MANBA_OPTIONS);
    const byManbaFail = zeros(MANBA_OPTIONS);

    let bugun = 0;
    let buHafta = 0;
    let yutuqTotal = 0;
    let yutuqBugun = 0;
    let failTotal = 0;

    const leadById = new Map<string, LeadRow>();
    const qarzLeadIds: string[] = [];

    for (const lead of leads) {
      leadById.set(lead.id, lead);
      bump(byBosqich, lead.bosqich);
      bump(byManba, lead.manba);
      bump(byTarif, lead.tarif);

      if (inHalfOpen(lead.yaratilgan, today.from, today.to)) bugun += 1;
      if (inClosed(lead.yaratilgan, week.from, week.to)) buHafta += 1;

      if (lead.bosqich === "yutuq") {
        yutuqTotal += 1;
        bump(byManbaYutuq, lead.manba);
        if (inHalfOpen(lead.bosqich_updated_at, today.from, today.to)) yutuqBugun += 1;
      }
      if (lead.bosqich === "muvaffaqiyatsizlik") {
        failTotal += 1;
        bump(byManbaFail, lead.manba);
      }
      if (lead.to_liq_status === "qarz") qarzLeadIds.push(lead.id);
    }

    const total = leads.length;

    let confirmedTotal = 0n;
    let pendingTotal = 0n;
    let confirmedWeek = 0n;
    let confirmedToday = 0n;
    const confirmedByLead = new Map<string, bigint>();
    const confirmedByStudent = new Map<string, bigint>();
    const confirmedLeadOnly = new Map<string, bigint>();
    const pendingByStudent = new Map<string, bigint>();
    const confirmedWeekByLead = new Map<string, bigint>();

    for (const pay of payments) {
      const amount = asBigInt(pay.amount);
      if (pay.status === "confirmed") {
        confirmedTotal += amount;
        if (inClosed(pay.created_at, week.from, week.to)) {
          confirmedWeek += amount;
          if (pay.lead_id) {
            confirmedWeekByLead.set(
              pay.lead_id,
              (confirmedWeekByLead.get(pay.lead_id) ?? 0n) + amount,
            );
          }
        }
        if (inHalfOpen(pay.created_at, today.from, today.to)) confirmedToday += amount;
        if (pay.lead_id) {
          confirmedByLead.set(pay.lead_id, (confirmedByLead.get(pay.lead_id) ?? 0n) + amount);
        }
        if (pay.student_id) {
          confirmedByStudent.set(
            pay.student_id,
            (confirmedByStudent.get(pay.student_id) ?? 0n) + amount,
          );
        } else if (pay.lead_id) {
          confirmedLeadOnly.set(
            pay.lead_id,
            (confirmedLeadOnly.get(pay.lead_id) ?? 0n) + amount,
          );
        }
      } else if (pay.status === "pending") {
        pendingTotal += amount;
        if (pay.student_id) {
          pendingByStudent.set(
            pay.student_id,
            (pendingByStudent.get(pay.student_id) ?? 0n) + amount,
          );
        }
      }
    }

    let qarzTotal = 0n;
    for (const id of qarzLeadIds) {
      const lead = leadById.get(id);
      if (!lead) continue;
      const due = asBigInt(lead.narx) - (confirmedByLead.get(id) ?? 0n);
      if (due > 0n) qarzTotal += due;
    }

    const byStage = zeros(STUDENT_STAGES);
    let qarzCount = 0;
    for (const student of students) {
      bump(byStage, student.stage);
      const lead = student.lead_id ? leadById.get(student.lead_id) : undefined;
      const price = asBigInt(lead?.narx);
      const paid =
        (confirmedByStudent.get(student.id) ?? 0n) +
        (student.lead_id ? (confirmedLeadOnly.get(student.lead_id) ?? 0n) : 0n);
      const pending = pendingByStudent.get(student.id) ?? 0n;
      const remaining = price > 0n ? price - paid : pending;
      if (remaining > 0n) qarzCount += 1;
    }

    const commissionByLevel = new Map<string, number>();
    for (const row of levels) {
      commissionByLevel.set(row.level, Number(row.commission ?? 0));
    }

    const weeklyByCloser = new Map<string, WeeklyRow>();
    for (const row of weekly) weeklyByCloser.set(row.closer_id, row);

    const closerLeadIds = new Map<string, string[]>();
    for (const row of assigns) {
      const list = closerLeadIds.get(row.sotuvchi_id) ?? [];
      list.push(row.lead_id);
      closerLeadIds.set(row.sotuvchi_id, list);
    }

    const closerPayload = closers.map((closer) => {
      const assigned = closerLeadIds.get(closer.id) ?? [];
      let openLeads = 0;
      let computedYutuqWeek = 0;
      let daromadWeek = 0n;

      for (const leadId of assigned) {
        const lead = leadById.get(leadId);
        if (!lead) continue;
        if (!CLOSED_STAGES.includes(lead.bosqich as (typeof CLOSED_STAGES)[number])) {
          openLeads += 1;
        }
        const wonThisWeek =
          lead.bosqich === "yutuq" &&
          inClosed(lead.bosqich_updated_at, week.from, week.to);
        if (wonThisWeek) computedYutuqWeek += 1;
        if (lead.bosqich === "yutuq") {
          daromadWeek += confirmedWeekByLead.get(leadId) ?? 0n;
        }
      }

      const stats = weeklyByCloser.get(closer.id);
      const yutuqBuHafta =
        stats?.yutuq != null
          ? Number(stats.yutuq)
          : computedYutuqWeek > 0
            ? computedYutuqWeek
            : Number(stats?.connected ?? 0);
      const connectedBuHafta = Number(stats?.connected ?? 0);
      const commission = commissionByLevel.get(closer.closer_level ?? "") ?? 0;

      return {
        id: closer.id,
        name: closer.name,
        level: closer.closer_level ?? "",
        open_leads: openLeads,
        yutuq_bu_hafta: yutuqBuHafta,
        connected_bu_hafta: connectedBuHafta,
        konversiya: pct(yutuqBuHafta, connectedBuHafta),
        commission,
        daromad_bu_hafta: daromadWeek.toString(),
      };
    });

    closerPayload.sort((a, b) => b.yutuq_bu_hafta - a.yutuq_bu_hafta);

    return NextResponse.json({
      leads: {
        total,
        bugun,
        bu_hafta: buHafta,
        by_bosqich: byBosqich,
        by_manba: byManba,
        by_tarif: byTarif,
        by_manba_yutuq: byManbaYutuq,
        by_manba_fail: byManbaFail,
      },
      conversions: {
        yutuq_total: yutuqTotal,
        yutuq_bugun: yutuqBugun,
        konversiya_foiz: pct(yutuqTotal, total),
        muvaffaqiyatsizlik_total: failTotal,
        muvaffaqiyatsizlik_foiz: pct(failTotal, total),
      },
      revenue: {
        confirmed_total: confirmedTotal.toString(),
        pending_total: pendingTotal.toString(),
        qarz_total: qarzTotal.toString(),
        bu_hafta: confirmedWeek.toString(),
        bugun: confirmedToday.toString(),
      },
      closers: closerPayload,
      students: {
        total: students.length,
        by_stage: byStage,
        qarz_count: qarzCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
