import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm/db";
import { LAST_CRON_CONFIG_KEY, type CronRobotResult } from "@/lib/crm/robots";

export const dynamic = "force-dynamic";

export type CronStatusPayload = {
  ts: string | null;
  results: CronRobotResult[];
};

export async function GET() {
  try {
    const db = crmAdmin();
    const { data, error } = await db
      .from("crm_config")
      .select("value")
      .eq("key", LAST_CRON_CONFIG_KEY)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const raw = (data?.value ?? null) as {
      ts?: string;
      results?: CronRobotResult[];
    } | null;

    const payload: CronStatusPayload = {
      ts: typeof raw?.ts === "string" ? raw.ts : null,
      results: Array.isArray(raw?.results) ? raw.results : [],
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
