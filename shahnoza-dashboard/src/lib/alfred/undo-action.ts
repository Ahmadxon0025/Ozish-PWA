import "server-only";
import {
  insertAccountEntry,
  deleteRelatedEntries,
} from "@/lib/business/account-posting";

export interface UndoResult {
  success: boolean;
  error?: string;
}

/**
 * Undo a previously executed Alfred action using the state captured at
 * execution time. Shared by the web app (tRPC undoAction) and the Telegram
 * bridge ("bekor" reply). `opsDb` performs the data reversals — the caller's
 * RLS client in the web app, the admin client for Telegram. `logDb` reads and
 * updates the action log (admin). Only the original actor may undo, and only
 * once: the log row is marked cancelled.
 */
export async function undoAlfredAction(opts: {
  opsDb: any;
  logDb: any;
  actionLogId: string;
  actorId: string;
}): Promise<UndoResult> {
  const { opsDb: db, logDb, actionLogId, actorId } = opts;
  try {
    const { data: log } = await logDb
      .from("alfred_action_log")
      .select("id, action_type, output_data, status, actor_id")
      .eq("id", actionLogId)
      .eq("actor_id", actorId)
      .single();

    if (!log) return { success: false, error: "Amal topilmadi" };
    if (log.status !== "executed") {
      return { success: false, error: "Bu amal allaqachon bekor qilingan" };
    }

    if (log.action_type === "create") {
      const taskId = log.output_data?.taskId;
      if (!taskId) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      const { error } = await db.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
    } else if (
      log.action_type === "assign" ||
      log.action_type === "update"
    ) {
      const previous: Array<{ taskId: string; fields: Record<string, any> }> =
        log.output_data?.previous ?? [];
      if (previous.length === 0) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      for (const p of previous) {
        const { error } = await db
          .from("tasks")
          .update(p.fields)
          .eq("id", p.taskId);
        if (error) throw error;

        // Restoring the assignee also restores the primary join row
        if ("assigned_to" in p.fields) {
          try {
            await db
              .from("task_assignees")
              .delete()
              .eq("task_id", p.taskId)
              .eq("is_primary", true);
            if (p.fields.assigned_to) {
              await db.from("task_assignees").insert({
                task_id: p.taskId,
                user_id: p.fields.assigned_to,
                is_primary: true,
              });
            }
          } catch {
            // join-table sync is best-effort
          }
        }
      }
    } else if (log.action_type === "expense") {
      // output_data is the created expense row; remove its ledger
      // movement first so the account balance stays true
      const expenseId = log.output_data?.id;
      if (!expenseId) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      await deleteRelatedEntries(db, "expense", expenseId);
      const { error } = await db
        .from("expenses")
        .delete()
        .eq("id", expenseId);
      if (error) throw error;
    } else if (log.action_type === "expense_update") {
      const expenseId = log.output_data?.expenseId;
      const prior = log.output_data?.prior;
      if (!expenseId || !prior) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      const { expense_date, account_id, ...fields } = prior;
      const { error } = await db
        .from("expenses")
        .update(fields)
        .eq("id", expenseId);
      if (error) throw error;
      // Restore the ledger movement to the prior amounts
      if (account_id && prior.amount_usd != null) {
        await deleteRelatedEntries(db, "expense", expenseId);
        await insertAccountEntry(db, {
          accountId: account_id,
          direction: "out",
          kind: "expense",
          amountUsd: prior.amount_usd,
          amountUzs: prior.amount ?? null,
          rate: prior.rate ?? 1,
          description: prior.description ?? null,
          relatedType: "expense",
          relatedId: expenseId,
          createdBy: actorId,
          occurredAt: expense_date ? `${expense_date}T12:00:00Z` : null,
        });
      }
    } else if (log.action_type === "expense_delete") {
      // output_data.prior is the full deleted row — restore it verbatim
      const prior = log.output_data?.prior;
      if (!prior?.id) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      const { error } = await db.from("expenses").insert(prior);
      if (error) throw error;
      if (prior.account_id && prior.amount_usd != null) {
        await insertAccountEntry(db, {
          accountId: prior.account_id,
          direction: "out",
          kind: "expense",
          amountUsd: prior.amount_usd,
          amountUzs: prior.amount ?? null,
          rate: prior.rate ?? 1,
          description: prior.description ?? null,
          relatedType: "expense",
          relatedId: prior.id,
          createdBy: actorId,
          occurredAt: prior.expense_date
            ? `${prior.expense_date}T12:00:00Z`
            : null,
        });
      }
    } else if (log.action_type === "sale") {
      const saleId = log.output_data?.saleId;
      if (!saleId) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      await db.from("payments").delete().eq("sale_id", saleId);
      const { error } = await db.from("sales").delete().eq("id", saleId);
      if (error) throw error;
      // Only remove the lead if this sale created it
      if (log.output_data?.createdLead && log.output_data?.leadId) {
        await db.from("leads").delete().eq("id", log.output_data.leadId);
      }
    } else if (log.action_type === "lead_update") {
      const leadId = log.output_data?.leadId;
      const prior = log.output_data?.prior;
      if (!leadId || !prior) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      const { error } = await db.from("leads").update(prior).eq("id", leadId);
      if (error) throw error;
      // If the change was pushed to amoCRM, reverse it there too (best-effort)
      const amo = log.output_data?.amo;
      if (amo?.pushed && amo?.amoLeadId) {
        try {
          const { pushLeadUndoToAmo } = await import("@/lib/amocrm/push");
          await pushLeadUndoToAmo({
            amoLeadId: Number(amo.amoLeadId),
            statusPushed: Boolean(amo.statusPushed),
            priorStatusId: amo.priorStatusId ?? null,
            priorResponsibleAmoUserId: amo.priorResponsibleAmoUserId ?? null,
          });
        } catch (amoError) {
          console.error("amoCRM undo push failed:", amoError);
        }
      }
    } else if (log.action_type === "payment") {
      const paymentId = log.output_data?.paymentId;
      if (!paymentId) {
        return { success: false, error: "Bekor qilish ma'lumoti yo'q" };
      }
      const prior = log.output_data?.prior;
      const { error } = await db
        .from("payments")
        .update({
          status: prior?.status ?? "pending",
          paid_at: prior?.paid_at ?? null,
        })
        .eq("id", paymentId);
      if (error) throw error;
    } else {
      return { success: false, error: "Bu turdagi amal bekor qilinmaydi" };
    }

    await logDb
      .from("alfred_action_log")
      .update({ status: "cancelled", error_message: "undone by user" })
      .eq("id", log.id);

    return { success: true };
  } catch (error) {
    console.error("Undo failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
