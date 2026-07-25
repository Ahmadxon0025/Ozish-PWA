/**
 * Alfred's witty conversation generator
 * Generates sophisticated, conversational, occasionally sarcastic messages
 */

interface ConversationContext {
  taskTitle: string;
  assigneeName: string;
  daysLate: number;
  daysUntil: number;
  reason: string;
  workloadStatus: "overloaded" | "balanced" | "light";
}

const ALFRED_RESPONSES = {
  overdue_heavy: [
    `@[NAME], I find myself compelled to inquire about "[TASK]" — it appears to have expired. Shall we extend the deadline, or was this merely a test of my patience?`,
    `@[NAME], "[TASK]" has been late for [DAYS] days. I don't wish to be presumptuous, but perhaps a new deadline would be more... realistic?`,
    `Good heavens, @[NAME]. "[TASK]" was due [DAYS] days ago. I've taken the liberty of drafting a new deadline. Shall I proceed?`,
    `@[NAME], "[TASK]" is now [DAYS] days overdue. I suspect you've been occupied. A postponement might be in order?`,
  ],
  due_soon_heavy: [
    `@[NAME], "[TASK]" arrives in [DAYS] days, and I notice you're currently... shall we say, occupied. Shall we renegotiate the timeline?`,
    `@[NAME], a gentle reminder: "[TASK]" is due in [DAYS] days. Your workload suggests you might need more time. I can adjust if necessary.`,
    `@[NAME], "[TASK]" is due [DAYS] days hence, and you're rather busy at the moment. Realistic, or shall we extend?`,
    `I notice "[TASK]" is due in [DAYS] days, @[NAME]. Given your current workload, might you need a bit more time?`,
  ],
  overdue_light: [
    `@[NAME], "[TASK]" has missed its deadline by [DAYS] days. You seem to have capacity — care to explain the delay?`,
    `@[NAME], I hate to be a bother, but "[TASK]" is now [DAYS] days late. Surely this can be rectified post-haste?`,
    `The schedule shows "[TASK]" was due [DAYS] days ago, @[NAME]. I suspect there's an explanation?`,
  ],
  workload_alert: [
    `@[NAME], I must inform you: you're currently managing [TASKS] tasks with [OVERDUE] overdue. This is rather a lot. Shall we redistribute?`,
    `@[NAME], my analysis suggests you're drowning in [TASKS] tasks. [OVERDUE] are already past deadline. Might we lighten your load?`,
    `I'm concerned about your workload, @[NAME]. [TASKS] tasks, [OVERDUE] overdue. Perhaps it's time to delegate?`,
  ],
};

export function generateAlfredMessage(context: ConversationContext): string {
  const pool =
    context.daysLate > 0
      ? context.workloadStatus === "overloaded"
        ? ALFRED_RESPONSES.overdue_heavy
        : ALFRED_RESPONSES.overdue_light
      : ALFRED_RESPONSES.due_soon_heavy;

  const message =
    pool[Math.floor(Math.random() * pool.length)];

  return message
    .replace("[NAME]", context.assigneeName)
    .replace("[TASK]", context.taskTitle)
    .replace("[DAYS]", Math.abs(context.daysLate || context.daysUntil).toString())
    .replace("[TASKS]", context.workloadStatus === "overloaded" ? "many" : "several")
    .replace("[OVERDUE]", "several");
}

export function generateWorkloadAlert(
  assigneeName: string,
  totalTasks: number,
  overdueTasks: number
): string {
  const alerts = ALFRED_RESPONSES.workload_alert;
  const message = alerts[Math.floor(Math.random() * alerts.length)];

  return message
    .replace("[NAME]", assigneeName)
    .replace("[TASKS]", totalTasks.toString())
    .replace("[OVERDUE]", overdueTasks.toString());
}

export function generateGroupMessage(
  suggestions: Array<{
    taskTitle: string;
    assigneeName: string;
    message: string;
    suggestedDeadline?: string;
  }>
): string {
  const header = "🎩 *Alfred's Analysis & Suggestions*\n\n";

  const messages = suggestions
    .map(s => {
      let msg = `${s.message}\n`;
      if (s.suggestedDeadline) {
        msg += `📅 Suggested new deadline: *${s.suggestedDeadline}*\n`;
      }
      return msg;
    })
    .join("\n");

  const footer =
    "\n_Shall I proceed with these adjustments, or would you prefer to discuss?_";

  return header + messages + footer;
}
