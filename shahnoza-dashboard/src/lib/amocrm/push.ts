import "server-only";
import { amoPatch, amoPost } from "./client";
import { AMO_STATUS_WON, AMO_STATUS_LOST } from "./mapping";

export interface AmoPushResult {
  pushed: boolean;
  detail: string;
}

/**
 * Best-effort write-back of a local lead change into amoCRM. Only fields with
 * an unambiguous universal mapping are patched: won/lost status (system ids
 * 142/143 in every pipeline) and the responsible user (users.amocrm_user_id).
 * Intermediate stage names are pipeline-specific, so those changes are
 * recorded as a note on the lead rather than guessed into a stage id.
 */
export async function pushLeadUpdateToAmo(opts: {
  amoLeadId: number;
  status?: string | null;
  responsibleAmoUserId?: number | null;
  noteText?: string | null;
}): Promise<AmoPushResult> {
  const { amoLeadId, status, responsibleAmoUserId, noteText } = opts;

  const patch: Record<string, unknown> = {};
  if (status === "sold") patch.status_id = AMO_STATUS_WON;
  if (status === "lost") patch.status_id = AMO_STATUS_LOST;
  if (responsibleAmoUserId) patch.responsible_user_id = responsibleAmoUserId;

  const done: string[] = [];
  if (Object.keys(patch).length > 0) {
    await amoPatch(`/api/v4/leads/${amoLeadId}`, patch);
    done.push(Object.keys(patch).join("+"));
  }
  if (noteText) {
    await amoPost(`/api/v4/leads/notes`, [
      { entity_id: amoLeadId, note_type: "common", params: { text: noteText } },
    ]);
    done.push("note");
  }
  return { pushed: done.length > 0, detail: done.join(", ") };
}

/**
 * Reverse a previously pushed change: restore the lead's original stage id
 * and/or responsible user, and leave a note saying the change was undone.
 */
export async function pushLeadUndoToAmo(opts: {
  amoLeadId: number;
  statusPushed?: boolean;
  priorStatusId?: number | null;
  priorResponsibleAmoUserId?: number | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (opts.statusPushed && opts.priorStatusId) {
    patch.status_id = opts.priorStatusId;
  }
  if (opts.priorResponsibleAmoUserId) {
    patch.responsible_user_id = opts.priorResponsibleAmoUserId;
  }
  if (Object.keys(patch).length > 0) {
    await amoPatch(`/api/v4/leads/${opts.amoLeadId}`, patch);
  }
  await amoPost(`/api/v4/leads/notes`, [
    {
      entity_id: opts.amoLeadId,
      note_type: "common",
      params: { text: "🎩 Alfred: oxirgi o'zgartirish bekor qilindi" },
    },
  ]);
}
