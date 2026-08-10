import "server-only";

/**
 * Content overrides loaded from the DB (edited in the dashboard) that the engine
 * layers over the code-defined flow: message text, delay minutes, and media.
 * Everything falls back to code, so a missing table/row never breaks the bot.
 * The engine sets the current snapshot once per invocation via setFlowOv().
 */

interface FlowOv {
  textById: Record<string, string>;
  minutesById: Record<string, number>;
  mediaByKey: Record<string, { fileId?: string; url?: string }>;
}

let CURRENT: FlowOv = { textById: {}, minutesById: {}, mediaByKey: {} };

export function setFlowOv(ov: FlowOv): void {
  CURRENT = ov;
}

export function ovText(id: string, fallback: string): string {
  return CURRENT.textById[id] ?? fallback;
}

export function ovMinutes(id: string, fallback: number): number {
  return CURRENT.minutesById[id] ?? fallback;
}

export function ovMedia(key: string): { fileId?: string; url?: string } | undefined {
  return CURRENT.mediaByKey[key];
}

/** Load the current overrides from the DB. Never throws — returns empty maps if
 *  the optional tables aren't applied yet. */
export async function loadFlowOv(db: any): Promise<FlowOv> {
  const ov: FlowOv = { textById: {}, minutesById: {}, mediaByKey: {} };
  try {
    const { data } = await db.from("funnel_bot_step_overrides").select("step_id, text, minutes");
    for (const r of (data ?? []) as Array<{ step_id: string; text: string | null; minutes: number | null }>) {
      if (r.text != null) ov.textById[r.step_id] = r.text;
      if (r.minutes != null) ov.minutesById[r.step_id] = r.minutes;
    }
  } catch {
    /* table not applied — use code defaults */
  }
  try {
    const { data } = await db.from("funnel_bot_media").select("media_key, file_id, url");
    for (const r of (data ?? []) as Array<{ media_key: string; file_id: string | null; url: string | null }>) {
      ov.mediaByKey[r.media_key] = { fileId: r.file_id ?? undefined, url: r.url ?? undefined };
    }
  } catch {
    /* table not applied — use code MEDIA */
  }
  return ov;
}
