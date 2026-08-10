import { FLOW, FLOW_KEY, ENTRY_STEP, type FlowStep } from "./flow";

/**
 * Flow registry — "one bot, funnels by link".
 *
 * The built-in lead-magnet flow lives in code (flow.ts). User-created flows
 * live in the funnel_bot_flows table as a jsonb step graph. The engine loads
 * a snapshot per invocation (same pattern as overrides.ts) and every step
 * lookup goes through the run's flow_key, so several funnels can run on the
 * same bot at once. A /start deep-link payload picks the flow.
 */

export interface FlowDef {
  key: string;
  name: string;
  status: string; // draft | live | archived
  entry: string;
  steps: FlowStep[];
  builtin: boolean;
}

function builtinDef(): FlowDef {
  return { key: FLOW_KEY, name: "Lead-magnit voronka", status: "live", entry: ENTRY_STEP, steps: FLOW, builtin: true };
}

let REG: Map<string, FlowDef> = new Map([[FLOW_KEY, builtinDef()]]);

export function setFlowReg(reg: Map<string, FlowDef>) {
  REG = reg;
}

export function getFlowDef(key: string): FlowDef | undefined {
  return REG.get(key) ?? (key === FLOW_KEY ? builtinDef() : undefined);
}

export function getStepIn(flowKey: string, stepId: string): FlowStep | undefined {
  const def = getFlowDef(flowKey);
  if (!def) return undefined;
  return def.steps.find((s) => s.id === stepId);
}

/** Map a /start payload to the flow it should launch (default: built-in). */
export function resolveStartKey(payload: string | null): string {
  const key = (payload ?? "").trim().toLowerCase();
  if (!key || !/^[a-z0-9_-]{1,64}$/.test(key)) return FLOW_KEY;
  const def = REG.get(key);
  return def && def.status === "live" ? def.key : FLOW_KEY;
}

/** Load all flows from the DB. Never throws — the bot must keep working even
 *  if the table isn't applied yet (then only the built-in flow exists). */
export async function loadFlowReg(db: {
  from: (t: string) => {
    select: (c: string) => Promise<{ data: unknown[] | null; error: unknown }>;
  };
}): Promise<Map<string, FlowDef>> {
  const reg = new Map<string, FlowDef>([[FLOW_KEY, builtinDef()]]);
  try {
    const { data } = await db.from("funnel_bot_flows").select("key, name, status, entry_step, steps, is_builtin");
    for (const row of (data ?? []) as Array<{ key: string; name: string; status: string; entry_step: string | null; steps: unknown; is_builtin: boolean }>) {
      if (row.is_builtin) continue; // code wins for the built-in flow
      const steps = Array.isArray(row.steps) ? (row.steps as FlowStep[]) : [];
      if (!steps.length) continue;
      reg.set(row.key, {
        key: row.key,
        name: row.name,
        status: row.status,
        entry: row.entry_step ?? steps[0]!.id,
        steps,
        builtin: false,
      });
    }
  } catch {
    /* table missing / transient error → built-in only */
  }
  return reg;
}
