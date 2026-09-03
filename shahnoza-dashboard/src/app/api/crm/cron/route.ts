import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm/db";
import {
  CRM_ROBOTS,
  LAST_CRON_CONFIG_KEY,
  type CronRobotResult,
} from "@/lib/crm/robots";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Vercel Cron sends GET; config panel POSTs. Same handler. */
export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}

async function runCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = crmAdmin();
  const results: CronRobotResult[] = [];

  for (const robot of CRM_ROBOTS) {
    try {
      const out = await robot.run(supabase);
      results.push({ robot: out.robot, affected: out.affected });
    } catch (err) {
      results.push({
        robot: robot.name,
        affected: 0,
        error: err instanceof Error ? err.message : "Noma'lum xato",
      });
    }
  }

  const payload = { ts: new Date().toISOString(), results };
  const { error: upsertError } = await supabase.from("crm_config").upsert({
    key: LAST_CRON_CONFIG_KEY,
    value: payload,
  });
  if (upsertError) {
    console.error("[crm/cron] last_cron_run yozilmadi:", upsertError.message);
  }

  return NextResponse.json({ ok: true, results });
}
