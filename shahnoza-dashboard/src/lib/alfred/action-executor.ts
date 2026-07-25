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

  private async executeAssign(data: {
    taskIds: string[];
    assigneeId: string;
  }): Promise<ActionResult> {
    try {
      const { taskIds, assigneeId } = data;

      if (!taskIds || !assigneeId) {
        return {
          success: false,
          message: "Missing task IDs or assignee ID",
        };
      }

      // For each task, update the assigned_to field
      for (const taskId of taskIds) {
        const { data: task } = await this.supabase
          .from("tasks")
          .select("assigned_to")
          .eq("id", taskId)
          .single();

        if (!task) {
          console.warn(`Task ${taskId} not found`);
          continue;
        }

        let assignedTo = task.assigned_to || [];
        if (typeof assignedTo === "string") {
          assignedTo = [assignedTo];
        }
        if (!Array.isArray(assignedTo)) {
          assignedTo = [];
        }

        if (!assignedTo.includes(assigneeId)) {
          assignedTo.push(assigneeId);
        }

        await this.supabase
          .from("tasks")
          .update({ assigned_to: assignedTo })
          .eq("id", taskId);
      }

      return {
        success: true,
        message: `Assigned ${taskIds.length} task(s) to user ${assigneeId}`,
        data: { taskCount: taskIds.length, assigneeId },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to assign tasks",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async executeUpdate(data: {
    taskId: string;
    updates: Record<string, any>;
  }): Promise<ActionResult> {
    try {
      const { taskId, updates } = data;

      if (!taskId || !updates) {
        return {
          success: false,
          message: "Missing task ID or updates",
        };
      }

      const { error } = await this.supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) {
        throw error;
      }

      return {
        success: true,
        message: `Updated task ${taskId}`,
        data: { taskId, updates },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to update task",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async executeCreate(data: {
    title: string;
    description?: string;
    assignedTo?: string;
    dueDate?: string;
  }): Promise<ActionResult> {
    try {
      const { title, description, assignedTo, dueDate } = data;

      if (!title) {
        return {
          success: false,
          message: "Missing task title",
        };
      }

      const { data: task, error } = await this.supabase
        .from("tasks")
        .insert({
          title,
          description: description || "",
          assigned_to: assignedTo ? [assignedTo] : [],
          due_date: dueDate,
          status: "todo",
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        message: `Created task: ${title}`,
        data: { taskId: task?.id, title },
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to create task",
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
