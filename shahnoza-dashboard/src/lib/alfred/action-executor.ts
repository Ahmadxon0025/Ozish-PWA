import { SupabaseClient } from "@supabase/supabase-js";
import { insertAccountEntry } from "@/lib/business/account-posting";
import { getCurrentRate } from "@/lib/business/exchange-rate";

export interface ActionInput {
  conversationId: string | null;
  actionId: string;
  actionType: "assign" | "update" | "create" | "notify" | "expense" | "expense_update" | "expense_delete" | "sale" | "payment";
  data: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
  error?: string;
  /** alfred_action_log row id — the undo handle. */
  logId?: string | null;
}

export class AlfredActionExecutor {
  constructor(private supabase: SupabaseClient, private userId: string) {}

  async execute(input: ActionInput): Promise<ActionResult> {
    const { conversationId, actionId, actionType, data } = input;

    try {
      // Log action
      const { data: logEntry, error: logError } = await this.supabase
        .from("alfred_action_log")
        .insert({
          conversation_id: conversationId || null,
          actor_id: this.userId,
          action_type: actionType,
          target_id: actionId,
          input_data: data,
          status: "pending",
        })
        .select()
        .single();

      if (logError) {
        console.error("Failed to create action log entry:", logError);
      }

      let result: ActionResult;

      switch (actionType) {
        case "assign":
          result = await this.executeAssign(data as any);
          break;
        case "update":
          result = await this.executeUpdate(data as any);
          break;
        case "create":
          result = await this.executeCreate(data as any);
          break;
        case "notify":
          result = await this.executeNotify(data as any);
          break;
        case "expense":
          result = await this.executeExpense(data as any);
          break;
        case "expense_update":
          result = await this.executeExpenseUpdate(data as any);
          break;
        case "expense_delete":
          result = await this.executeExpenseDelete(data as any);
          break;
        case "sale":
          result = await this.executeSale(data as any);
          break;
        case "payment":
          result = await this.executePayment(data as any);
          break;
        default:
          result = {
            success: false,
            message: "Unknown action type",
          };
      }

      // Update action log
      if (logEntry) {
        const { error: updateError } = await this.supabase
          .from("alfred_action_log")
          .update({
            status: result.success ? "executed" : "failed",
            output_data: result.data,
            error_message: result.error,
            executed_at: new Date().toISOString(),
          })
          .eq("id", logEntry.id);

        if (updateError) {
          console.error("Failed to update action log:", updateError);
        }
      }

      return { ...result, logId: logEntry?.id ?? null };
    } catch (error) {
      console.error("Action execution error:", error);
      return {
        success: false,
        message: "Failed to execute action",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** Find a team member by (partial) name. Errors are returned, not thrown. */
  private async resolveUserByName(
    name: string
  ): Promise<{ id: string; full_name: string } | { error: string }> {
    const { data: users } = await this.supabase
      .from("users")
      .select("id, full_name")
      .ilike("full_name", `%${name.trim()}%`)
      .limit(5);

    if (!users || users.length === 0) {
      return { error: `"${name}" ismli foydalanuvchi topilmadi` };
    }
    if (users.length === 1) return users[0];

    const exact = users.find(
      (u: any) =>
        (u.full_name ?? "").trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (exact) return exact;
    return {
      error: `"${name}" bo'yicha bir nechta foydalanuvchi topildi: ${users
        .map((u: any) => u.full_name)
        .join(", ")}. Aniqroq ism kerak.`,
    };
  }

  /** Find an open task by (partial) title. Errors are returned, not thrown. */
  private async resolveTaskByTitle(
    title: string
  ): Promise<{ id: string; title: string; assigned_to: any } | { error: string }> {
    const { data: tasks } = await this.supabase
      .from("tasks")
      .select("id, title, assigned_to, status")
      .ilike("title", `%${title.trim()}%`)
      .neq("status", "done")
      .limit(5);

    if (!tasks || tasks.length === 0) {
      return { error: `"${title}" nomli ochiq vazifa topilmadi` };
    }
    if (tasks.length === 1) return tasks[0];

    const exact = tasks.find(
      (t: any) =>
        (t.title ?? "").trim().toLowerCase() === title.trim().toLowerCase()
    );
    if (exact) return exact;
    return {
      error: `"${title}" bo'yicha bir nechta vazifa topildi: ${tasks
        .map((t: any) => `"${t.title}"`)
        .join(", ")}. Aniqroq nom kerak.`,
    };
  }

  private async executeAssign(data: {
    task_title?: string;
    assignee_name?: string;
    taskIds?: string[];
    assigneeId?: string;
  }): Promise<ActionResult> {
    try {
      // Resolve by name (how the model proposes) or accept raw ids
      let taskIds = data.taskIds ?? [];
      let assigneeId = data.assigneeId ?? "";
      let assigneeLabel = assigneeId;

      const assignTitle = data.task_title ?? (data as any).title;
      if (assignTitle) {
        const task = await this.resolveTaskByTitle(assignTitle);
        if ("error" in task) return { success: false, message: task.error };
        taskIds = [task.id];
      }
      if (data.assignee_name) {
        const user = await this.resolveUserByName(data.assignee_name);
        if ("error" in user) return { success: false, message: user.error };
        assigneeId = user.id;
        assigneeLabel = user.full_name;
      }

      if (taskIds.length === 0 || !assigneeId) {
        return { success: false, message: "Vazifa yoki mas'ul aniqlanmadi" };
      }

      // tasks.assigned_to is a single UUID (the primary/DRI). Capture the
      // prior value per task so the action can be undone.
      const previous: Array<{ taskId: string; fields: Record<string, any> }> = [];

      for (const taskId of taskIds) {
        const { data: task } = await this.supabase
          .from("tasks")
          .select("assigned_to")
          .eq("id", taskId)
          .single();
        if (!task) continue;
        if (task.assigned_to === assigneeId) continue;

        previous.push({
          taskId,
          fields: { assigned_to: task.assigned_to ?? null },
        });

        const { error } = await this.supabase
          .from("tasks")
          .update({ assigned_to: assigneeId })
          .eq("id", taskId);
        if (error) throw error;

        await this.syncPrimaryAssignee(taskId, assigneeId);
      }

      return {
        success: true,
        message: `${taskIds.length} ta vazifa ${assigneeLabel}ga biriktirildi`,
        data: { taskCount: taskIds.length, assigneeId, previous },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Vazifani biriktirib bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  /**
   * Keep the task_assignees join table's primary row in sync with
   * tasks.assigned_to (collaborator rows are left untouched). Best-effort.
   */
  private async syncPrimaryAssignee(
    taskId: string,
    assigneeId: string | null
  ): Promise<void> {
    try {
      await this.supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", taskId)
        .eq("is_primary", true);
      if (assigneeId) {
        await this.supabase
          .from("task_assignees")
          .insert({ task_id: taskId, user_id: assigneeId, is_primary: true });
      }
    } catch (error) {
      console.warn("Primary assignee sync failed:", error);
    }
  }

  private async executeUpdate(data: {
    task_title?: string;
    title?: string;
    taskId?: string;
    assignee_name?: string;
    updates?: Record<string, any>;
    [key: string]: any;
  }): Promise<ActionResult> {
    try {
      let taskId = data.taskId ?? "";
      let taskLabel = taskId;

      const updateTitle = data.task_title ?? data.title;
      if (updateTitle) {
        const task = await this.resolveTaskByTitle(updateTitle);
        if ("error" in task) return { success: false, message: task.error };
        taskId = task.id;
        taskLabel = task.title;
      }

      if (!taskId) {
        return { success: false, message: "Vazifa aniqlanmadi" };
      }

      // Whitelist the fields the model may change. The model sometimes puts
      // fields at the top level instead of inside `updates` — accept both.
      const allowed = ["status", "due_date", "priority"];
      const source = data.updates ?? data;
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (source[key] !== undefined) updates[key] = source[key];
      }

      // An update carrying assignee_name is also a reassignment
      let newAssigneeId: string | null = null;
      if (data.assignee_name || data.updates?.assignee_name) {
        const user = await this.resolveUserByName(
          data.assignee_name ?? data.updates?.assignee_name
        );
        if ("error" in user) return { success: false, message: user.error };
        newAssigneeId = user.id;
        updates.assigned_to = user.id;
      }

      if (Object.keys(updates).length === 0) {
        return { success: false, message: "Ruxsat etilgan o'zgarish yo'q" };
      }
      if (updates.status === "done") {
        updates.completed_at = new Date().toISOString();
      }

      // Capture prior values of exactly the fields we're changing (undo data)
      const { data: before } = await this.supabase
        .from("tasks")
        .select(Object.keys(updates).join(", "))
        .eq("id", taskId)
        .single();
      const previous = before
        ? [{ taskId, fields: before as Record<string, any> }]
        : [];

      const { error } = await this.supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);
      if (error) throw error;

      if (newAssigneeId) {
        await this.syncPrimaryAssignee(taskId, newAssigneeId);
      }

      return {
        success: true,
        message: `"${taskLabel}" yangilandi (${Object.keys(updates).join(", ")})`,
        data: { taskId, updates, previous },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Vazifani yangilab bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  private async executeCreate(data: {
    title: string;
    description?: string;
    assignee_name?: string;
    assignedTo?: string;
    due_date?: string;
    dueDate?: string;
    priority?: string;
  }): Promise<ActionResult> {
    try {
      const title = data.title;
      if (!title) {
        return { success: false, message: "Vazifa nomi ko'rsatilmagan" };
      }

      // Idempotency guard: agents retry, users repeat themselves — never
      // create a second open task with the same title.
      const { data: dup } = await this.supabase
        .from("tasks")
        .select("id")
        .ilike("title", title.trim())
        .neq("status", "done")
        .limit(1);
      if (dup && dup.length > 0) {
        return {
          success: false,
          message: `"${title}" nomli ochiq vazifa allaqachon mavjud — takror yaratilmadi`,
        };
      }

      let assigneeId = data.assignedTo ?? null;
      let assigneeLabel: string | null = null;
      if (data.assignee_name) {
        const user = await this.resolveUserByName(data.assignee_name);
        if ("error" in user) return { success: false, message: user.error };
        assigneeId = user.id;
        assigneeLabel = user.full_name;
      }
      // Same default as the tasks router: unassigned work goes to the creator
      const primaryId = assigneeId ?? this.userId;

      // Map model synonyms onto the real enum (schema default is 'medium')
      const priorityMap: Record<string, string> = {
        low: "low",
        normal: "medium",
        medium: "medium",
        high: "high",
        urgent: "urgent",
      };
      const priority = priorityMap[data.priority ?? ""] ?? "medium";

      const { data: task, error } = await this.supabase
        .from("tasks")
        .insert({
          title,
          description: data.description || null,
          assigned_to: primaryId,
          created_by: this.userId,
          priority,
          status: "todo",
          due_date: data.due_date ?? data.dueDate ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      await this.syncPrimaryAssignee(task.id, primaryId);

      // Tier B courtesy: tell the assignee (Telegram DM / push), never fatal
      try {
        const { notifyTaskCreated } = await import("@/lib/notify/task-events");
        await notifyTaskCreated({
          taskId: task.id,
          title: task.title,
          assignedTo: primaryId,
          createdBy: this.userId,
          priority,
          dueDate: task.due_date ?? null,
          isSubtask: false,
        });
      } catch {
        // notifications are best-effort
      }

      return {
        success: true,
        message: `Vazifa yaratildi: "${title}"${assigneeLabel ? ` → ${assigneeLabel}` : ""}`,
        data: { taskId: task?.id, title },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Vazifa yaratib bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  private async executeNotify(data: {
    userId: string;
    message: string;
    type?: "info" | "warning" | "success";
  }): Promise<ActionResult> {
    try {
      const { userId, message, type = "info" } = data;

      if (!userId || !message) {
        return {
          success: false,
          message: "Missing user ID or message",
        };
      }

      // Store notification in database (simplified - in production would integrate with notification service)
      const { error } = await this.supabase
        .from("notifications")
        .insert({
          user_id: userId,
          title: "Alfred Update",
          message,
          type,
          read: false,
        })
        .select();

      if (error && error.code !== "PGRST204") {
        // Ignore "no rows returned" errors
        console.warn("Notification insert may have failed:", error);
      }

      return {
        success: true,
        message: `Notification sent to user ${userId}`,
        data: { userId, message },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to send notification",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** Create an expense record. */
  private async executeExpense(data: {
    amount: number;
    description: string;
    paid_to?: string;
    currency?: string;
    expense_date?: string;
    account_id?: string;
    category_id?: string;
  }): Promise<ActionResult> {
    try {
      const amount = Number(data.amount);
      const description = String(data.description || "").trim();
      const paid_to = String(data.paid_to || "").trim();
      const currency = String(data.currency || "uzs").toLowerCase();
      const expense_date = data.expense_date || new Date().toISOString().slice(0, 10);

      if (!amount || amount <= 0 || !description) {
        return {
          success: false,
          message: "Xarajat: miqdori va tavsifi majburiy",
        };
      }

      // If no account specified, pick one matching the currency
      let account_id = data.account_id;
      if (!account_id) {
        const { data: accounts } = await this.supabase
          .from("accounts")
          .select("id")
          .eq("currency", currency === "uzs" ? "UZS" : "USD")
          .order("sort_order", { ascending: true })
          .limit(1);

        if (accounts && accounts.length > 0) {
          account_id = accounts[0].id;
        } else {
          // Fallback: pick any account
          const { data: anyAccounts } = await this.supabase
            .from("accounts")
            .select("id")
            .order("sort_order", { ascending: true })
            .limit(1);
          if (anyAccounts && anyAccounts.length > 0) {
            account_id = anyAccounts[0].id;
          }
        }
      }

      // If no category specified, pick the first one or a default "Other"
      let category_id = data.category_id;
      if (!category_id) {
        const { data: categories } = await this.supabase
          .from("expense_categories")
          .select("id")
          .order("display_order", { ascending: true })
          .limit(1);
        if (categories && categories.length > 0) {
          category_id = categories[0].id;
        }
      }

      // Get current exchange rate for proper currency conversion
      const rate = await getCurrentRate(this.supabase);
      const amount_usd =
        currency === "uzs" ? Number((amount / rate.rate).toFixed(2)) : amount;
      const amount_uzs =
        currency === "uzs" ? Math.round(amount) : Math.round(amount * rate.rate);

      const { data: result, error } = await this.supabase
        .from("expenses")
        .insert({
          description,
          paid_to: paid_to || null,
          amount: currency === "uzs" ? amount : null,
          amount_usd,
          amount_uzs,
          rate: rate.rate,
          currency,
          expense_date,
          created_by: this.userId,
          account_id: account_id || null,
          category_id: category_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create the corresponding account movement (debit from account)
      if (account_id && result) {
        try {
          await insertAccountEntry(this.supabase, {
            accountId: account_id,
            direction: "out",
            kind: "expense",
            amountUsd: amount_usd,
            amountUzs: currency === "uzs" ? amount : null,
            rate: rate.rate,
            description: description,
            relatedType: "expense",
            relatedId: result.id,
            createdBy: this.userId,
            occurredAt: `${expense_date}T12:00:00Z`,
          });
        } catch (entryError) {
          console.error("Failed to create account entry for expense:", entryError);
          // Don't fail the whole action if account entry fails
        }
      }

      return {
        success: true,
        message: `Xarajat qo'shildi: ${amount}${currency === "uzs" ? " so'm" : " USD"} (${description})`,
        data: result,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Xarajatni qo'shib bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  /** Update (correct) a recent expense. Finds by description match or "most recent". */
  private async executeExpenseUpdate(data: {
    description?: string;
    amount?: number;
    paid_to?: string;
    currency?: string;
    match_description?: string;
  }): Promise<ActionResult> {
    try {
      const new_description =
        data.description && String(data.description).trim();
      const new_amount = data.amount ? Number(data.amount) : null;
      const new_paid_to = data.paid_to ? String(data.paid_to).trim() : null;
      const currency = String(data.currency || "uzs").toLowerCase();
      const matchDesc = data.match_description
        ? String(data.match_description).trim()
        : null;

      if (!new_amount && !new_description && !new_paid_to) {
        return {
          success: false,
          message: "Xarajat: yangi miqdor yoki tavsif kerak",
        };
      }

      // Find the expense to update: by description match or most recent
      let query = this.supabase.from("expenses").select("id, description, amount, amount_usd, currency, paid_to, expense_date, account_id");

      if (matchDesc) {
        query = query.ilike("description", `%${matchDesc}%`);
      }

      const { data: expenses } = await query
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!expenses || expenses.length === 0) {
        return {
          success: false,
          message: matchDesc
            ? `"${matchDesc}" tasvifli xarajat topilmadi`
            : "Yaqinda qo'shilgan xarajat topilmadi",
        };
      }

      const expense = expenses[0];
      const prior = {
        description: expense.description,
        amount: expense.amount,
        amount_usd: expense.amount_usd,
        paid_to: expense.paid_to,
      };

      // Prepare updates
      const updates: Record<string, any> = {};
      if (new_description) updates.description = new_description;
      if (new_paid_to) updates.paid_to = new_paid_to;
      if (new_amount) {
        updates.amount = currency === "uzs" ? new_amount : null;
        updates.amount_usd = currency === "uzs" ? Number((new_amount / 12800).toFixed(2)) : new_amount;
        updates.currency = currency;
      }
      // Link to account if orphaned
      if (!expense.account_id) {
        const { data: accounts } = await this.supabase
          .from("accounts")
          .select("id")
          .eq("currency", expense.currency === "uzs" ? "UZS" : "USD")
          .order("sort_order", { ascending: true })
          .limit(1);
        if (accounts && accounts.length > 0) {
          updates.account_id = accounts[0].id;
        }
      }

      const { error } = await this.supabase
        .from("expenses")
        .update(updates)
        .eq("id", expense.id);

      if (error) throw error;

      const changed = Object.keys(updates).join(", ");
      return {
        success: true,
        message: `Xarajat to'g'rilandi (${changed}): ${new_amount || expense.amount}${currency === "uzs" ? " so'm" : " USD"}`,
        data: { expenseId: expense.id, prior, updates },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Xarajatni to'g'rlab bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  /** Delete (cancel) an expense. Finds by description match or most recent. */
  private async executeExpenseDelete(data: {
    match_description?: string;
  }): Promise<ActionResult> {
    try {
      const matchDesc = data.match_description
        ? String(data.match_description).trim()
        : null;

      // Find the expense to delete: by description match or most recent
      let query = this.supabase
        .from("expenses")
        .select("id, description, amount, amount_usd, currency, paid_to, expense_date, created_at, account_id");

      if (matchDesc) {
        query = query.ilike("description", `%${matchDesc}%`);
      }

      const { data: expenses } = await query
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!expenses || expenses.length === 0) {
        return {
          success: false,
          message: matchDesc
            ? `"${matchDesc}" tasvifli xarajat topilmadi`
            : "Yaqinda qo'shilgan xarajat topilmadi",
        };
      }

      const expense = expenses[0];
      const prior = {
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        amount_usd: expense.amount_usd,
        paid_to: expense.paid_to,
        expense_date: expense.expense_date,
        account_id: expense.account_id,
      };

      // Delete the expense
      const { error } = await this.supabase
        .from("expenses")
        .delete()
        .eq("id", expense.id);

      if (error) throw error;

      return {
        success: true,
        message: `Xarajat bekor qilindi: ${expense.amount}${expense.currency === "uzs" ? " so'm" : " USD"} (${expense.description})`,
        data: { expenseId: expense.id, prior },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Xarajatni bekor qilib bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  /** Create a sale and associated payment record. */
  private async executeSale(data: {
    customer_name: string;
    amount: number;
    product_name?: string;
    currency?: string;
    sold_at?: string;
    notes?: string;
  }): Promise<ActionResult> {
    try {
      const customer_name = String(data.customer_name || "").trim();
      const amount = Number(data.amount);
      const product_name = String(data.product_name || "").trim();
      const currency = String(data.currency || "uzs").toLowerCase();
      const sold_at = data.sold_at || new Date().toISOString();
      const notes = String(data.notes || "").trim();

      if (!customer_name || !amount || amount <= 0) {
        return {
          success: false,
          message: "Sotuv: mijoz nomi va miqdori majburiy",
        };
      }

      // Try to find or create the lead/customer
      const { data: leads } = await this.supabase
        .from("leads")
        .select("id")
        .ilike("full_name", `%${customer_name}%`)
        .limit(2);

      let leadId: string | null = null;
      if (leads && leads.length === 1) {
        leadId = leads[0].id;
      } else if (!leads || leads.length === 0) {
        // Create a new lead if not found
        const { data: newLead, error: createError } = await this.supabase
          .from("leads")
          .insert({ full_name: customer_name, status: "sold" })
          .select()
          .single();
        if (createError) throw createError;
        leadId = newLead.id;
      } else {
        return {
          success: false,
          message: `"${customer_name}" bo'yicha bir nechta mijoz topildi. Aniqroq nom kerak.`,
        };
      }

      // Convert amount to USD if in UZS
      const amount_usd = currency === "uzs" ? Number((amount / 12800).toFixed(2)) : amount;
      const amount_uzs = currency === "uzs" ? amount : null;

      // Create the sale
      const { data: sale, error: saleError } = await this.supabase
        .from("sales")
        .insert({
          lead_id: leadId,
          sales_person_id: this.userId,
          total_amount_usd: currency !== "uzs" ? amount : amount_usd,
          total_amount_uzs: amount_uzs,
          sold_at,
          notes: notes || null,
          payment_type: "full", // Default; can be refined later
          is_refunded: false,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create a payment/receivable record
      const dueDate = new Date(sold_at);
      dueDate.setDate(dueDate.getDate() + 7); // Default due in 7 days
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      const { error: paymentError } = await this.supabase.from("payments").insert({
        sale_id: sale.id,
        amount_usd: currency !== "uzs" ? amount : amount_usd,
        status: "pending",
        due_date: dueDateStr,
      });

      if (paymentError) throw paymentError;

      return {
        success: true,
        message: `Sotuv qo'shildi: ${customer_name}, ${amount}${currency === "uzs" ? " so'm" : " USD"}`,
        data: { saleId: sale.id, leadId },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Sotuvni qo'shib bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }

  /** Mark a payment as paid or log a payment. */
  private async executePayment(data: {
    customer_name: string;
    amount: number;
    currency?: string;
  }): Promise<ActionResult> {
    try {
      const customer_name = String(data.customer_name || "").trim();
      const amount = Number(data.amount);
      const currency = String(data.currency || "uzs").toLowerCase();

      if (!customer_name || !amount || amount <= 0) {
        return {
          success: false,
          message: "To'lov: mijoz nomi va miqdori majburiy",
        };
      }

      // Find unpaid payments for this customer
      const { data: leads } = await this.supabase
        .from("leads")
        .select("id")
        .ilike("full_name", `%${customer_name}%`)
        .limit(2);

      if (!leads || leads.length === 0) {
        return {
          success: false,
          message: `"${customer_name}" topilmadi`,
        };
      }

      if (leads.length > 1) {
        return {
          success: false,
          message: `"${customer_name}" bo'yicha bir nechta mijoz topildi. Aniqroq nom kerak.`,
        };
      }

      const leadId = leads[0].id;

      // Find the latest unpaid payment for this lead
      const { data: payments } = await this.supabase
        .from("payments")
        .select("id, sale_id, amount_usd, status")
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(1);

      // TODO: join with sales to filter by lead_id. For now, update the first unpaid.
      if (!payments || payments.length === 0) {
        return {
          success: false,
          message: `"${customer_name}" uchun to'lanishi kerak qolgan to'lov topilmadi`,
        };
      }

      const payment = payments[0];
      const { error } = await this.supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", payment.id);

      if (error) throw error;

      return {
        success: true,
        message: `To'lov qo'yildi: ${customer_name}, ${amount}${currency === "uzs" ? " so'm" : " USD"}`,
        data: { paymentId: payment.id },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `To'lovni qo'yib bo'lmadi: ${detail}`,
        error: detail,
      };
    }
  }
}
