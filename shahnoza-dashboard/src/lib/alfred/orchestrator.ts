import { requireAdminClient } from "@/lib/supabase/admin";
import { analyzeAllTasks } from "./analyzer";
import { generateGroupMessage, generateAlfredMessage } from "./conversationalist";
import { env } from "@/lib/env";

/**
 * Alfred - The intelligent task management brain
 * Analyzes workloads, suggests optimizations, sends updates
 */

export async function runAlfredAnalysis() {
  try {
    const client = requireAdminClient();

    // Fetch all tasks and users
    const [tasksResult, usersResult, settingsResult] = await Promise.all([
      client.from("tasks").select("*"),
      client.from("users").select("*"),
      client
        .from("app_settings")
        .select("value")
        .eq("key", "task_management_group_id")
        .maybeSingle(),
    ]);

    if (tasksResult.error || usersResult.error) {
      throw new Error("Failed to fetch data");
    }

    const tasks = tasksResult.data || [];
    const users = usersResult.data || [];
    const groupId = settingsResult.data?.value;

    if (!groupId) {
      console.log("⚠️ Alfred: No task_management_group_id configured");
      return null;
    }

    // Run analysis
    const analysis = await analyzeAllTasks(tasks, users);

    // Generate Telegram message with suggestions
    const suggestions = analysis.rescheduleSuggestions.map(task => ({
      taskTitle: task.taskTitle,
      assigneeName: task.assigneeName,
      message: generateAlfredMessage({
        taskTitle: task.taskTitle,
        assigneeName: task.assigneeName,
        daysLate: task.isOverdue ? -task.daysUntilDeadline : 0,
        daysUntil: task.daysUntilDeadline,
        reason: task.reason || "",
        workloadStatus: analysis.userWorkloads.find(
          w => w.userId === task.assigneeId
        )?.workloadStatus || "balanced",
      }),
      suggestedDeadline: task.suggestedNewDeadline,
    }));

    if (suggestions.length > 0) {
      const message = generateGroupMessage(suggestions);
      await notifyTelegramGroup(groupId, message);
    }

    // Send workload alerts
    for (const alert of analysis.workloadAlerts) {
      const userWorkload = analysis.userWorkloads.find(
        w => w.userId === alert.userId
      );
      if (userWorkload) {
        const alertMsg = `🎩 Alfred here, @${alert.userName.replace(/\s+/g, "_")}\n\n${alert.message}\n\nShall we redistribute some tasks?`;
        await notifyTelegramGroup(groupId, alertMsg);
      }
    }

    return analysis;
  } catch (error) {
    console.error("❌ Alfred analysis error:", error);
    return null;
  }
}

async function notifyTelegramGroup(chatId: string, message: string) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: "Markdown",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

export async function updateTaskDeadline(
  taskId: string,
  newDeadline: string
): Promise<boolean> {
  try {
    const client = requireAdminClient();

    const { error } = await client
      .from("tasks")
      .update({ due_date: newDeadline })
      .eq("id", taskId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error("❌ Failed to update task deadline:", error);
    return false;
  }
}

export async function reassignTask(
  taskId: string,
  newAssigneeId: string
): Promise<boolean> {
  try {
    const client = requireAdminClient();

    const { error } = await client
      .from("tasks")
      .update({ assigned_to: [newAssigneeId] })
      .eq("id", taskId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error("❌ Failed to reassign task:", error);
    return false;
  }
}
