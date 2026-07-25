import { SupabaseClient } from "@supabase/supabase-js";

export interface ActionInput {
  conversationId: string;
  actionId: string;
  actionType: "assign" | "update" | "create" | "notify";
  data: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
  error?: string;
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
          conversation_id: conversationId,
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

      return result;
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

      for (const taskId of taskIds) {
        const { data: task } = await this.supabase
          .from("tasks")
          .select("assigned_to")
          .eq("id", taskId)
          .single();
        if (!task) continue;

        let assignedTo = task.assigned_to || [];
        if (typeof assignedTo === "string") assignedTo = [assignedTo];
        if (!Array.isArray(assignedTo)) assignedTo = [];
        if (!assignedTo.includes(assigneeId)) assignedTo.push(assigneeId);

        const { error } = await this.supabase
          .from("tasks")
          .update({ assigned_to: assignedTo })
          .eq("id", taskId);
        if (error) throw error;
      }

      return {
        success: true,
        message: `${taskIds.length} ta vazifa ${assigneeLabel}ga biriktirildi`,
        data: { taskCount: taskIds.length, assigneeId },
      };
    } catch (error) {
      return {
        success: false,
        message: "Vazifani biriktirib bo'lmadi",
        error: error instanceof Error ? error.message : "Unknown error",
      };
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

      const { error } = await this.supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);
      if (error) throw error;

      return {
        success: true,
        message: `"${taskLabel}" yangilandi (${Object.keys(updates).join(", ")})`,
        data: { taskId, updates },
      };
    } catch (error) {
      return {
        success: false,
        message: "Vazifani yangilab bo'lmadi",
        error: error instanceof Error ? error.message : "Unknown error",
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

      let assigneeId = data.assignedTo ?? null;
      let assigneeLabel: string | null = null;
      if (data.assignee_name) {
        const user = await this.resolveUserByName(data.assignee_name);
        if ("error" in user) return { success: false, message: user.error };
        assigneeId = user.id;
        assigneeLabel = user.full_name;
      }

      const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);
      const insert: Record<string, any> = {
        title,
        description: data.description || "",
        assigned_to: assigneeId ? [assigneeId] : [],
        due_date: data.due_date ?? data.dueDate ?? null,
        status: "todo",
      };
      if (data.priority && allowedPriorities.has(data.priority)) {
        insert.priority = data.priority;
      }

      const { data: task, error } = await this.supabase
        .from("tasks")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;

      return {
        success: true,
        message: `Vazifa yaratildi: "${title}"${assigneeLabel ? ` → ${assigneeLabel}` : ""}`,
        data: { taskId: task?.id, title },
      };
    } catch (error) {
      return {
        success: false,
        message: "Vazifa yaratib bo'lmadi",
        error: error instanceof Error ? error.message : "Unknown error",
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
