import { SupabaseClient } from "@supabase/supabase-js";

export interface ActionInput {
  conversationId: string | null;
  actionId: string;
  actionType: "assign" | "update" | "create" | "notify";
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
      const { data: logEntry } = await this.supabase
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
        default:
          result = {
            success: false,
            message: "Unknown action type",
          };
      }

      // Update action log
      if (logEntry) {
        await this.supabase
          .from("alfred_action_log")
          .update({
            status: result.success ? "executed" : "failed",
            output_data: result.data,
            error_message: result.error,
            executed_at: new Date().toISOString(),
          })
          .eq("id", logEntry.id);
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

      if (data.task_title) {
        const task = await this.resolveTaskByTitle(data.task_title);
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
    taskId?: string;
    updates: Record<string, any>;
  }): Promise<ActionResult> {
    try {
      let taskId = data.taskId ?? "";
      let taskLabel = taskId;

      if (data.task_title) {
        const task = await this.resolveTaskByTitle(data.task_title);
        if ("error" in task) return { success: false, message: task.error };
        taskId = task.id;
        taskLabel = task.title;
      }

      if (!taskId || !data.updates) {
        return { success: false, message: "Vazifa yoki o'zgarish aniqlanmadi" };
      }

      // Whitelist the fields the model may change
      const allowed = ["status", "due_date", "priority"];
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (data.updates[key] !== undefined) updates[key] = data.updates[key];
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
}
