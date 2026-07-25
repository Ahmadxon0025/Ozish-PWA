import { Database } from "@/types/database";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type User = Database["public"]["Tables"]["users"]["Row"];

interface TaskAnalysis {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  assigneeName: string;
  deadline: string;
  status: string;
  daysUntilDeadline: number;
  isOverdue: boolean;
  priority: "critical" | "high" | "medium" | "low";
  suggestion?: string;
  suggestedNewDeadline?: string;
  reason?: string;
}

interface UserWorkload {
  userId: string;
  userName: string;
  totalTasks: number;
  overdueTasks: number;
  dueSoon: number; // next 3 days
  averageCompletionDays: number;
  workloadStatus: "overloaded" | "balanced" | "light";
}

interface AlfredAnalysis {
  timestamp: string;
  userWorkloads: UserWorkload[];
  criticalTasks: TaskAnalysis[];
  rescheduleSuggestions: TaskAnalysis[];
  workloadAlerts: Array<{
    userId: string;
    userName: string;
    message: string;
  }>;
}

export async function analyzeAllTasks(
  tasks: Task[],
  users: User[],
  historicalData?: any
): Promise<AlfredAnalysis> {
  const now = new Date();
  const userMap = new Map(users.map(u => [u.id, u]));

  // Analyze each task
  const taskAnalyses: TaskAnalysis[] = tasks
    .filter(t => t.status !== "done")
    .map(task => {
      const assignee = userMap.get(task.assigned_to?.[0]);
      const deadline = task.due_date ? new Date(task.due_date) : null;
      const daysUntil = deadline
        ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        taskId: task.id,
        taskTitle: task.title,
        assigneeId: task.assigned_to?.[0] || "",
        assigneeName: assignee?.full_name || "Unknown",
        deadline: deadline?.toISOString().split("T")[0] || "No deadline",
        status: task.status,
        daysUntilDeadline: daysUntil,
        isOverdue: daysUntil < 0,
        priority: calculatePriority(daysUntil, task.status),
      };
    });

  // Calculate user workloads
  const userWorkloads = calculateWorkloads(taskAnalyses, users);

  // Find critical tasks
  const criticalTasks = taskAnalyses.filter(
    t => t.isOverdue || t.daysUntilDeadline <= 3
  );

  // Generate reschedule suggestions
  const suggestions = generateSuggestions(
    taskAnalyses,
    userWorkloads,
    historicalData
  );

  // Generate workload alerts
  const workloadAlerts = userWorkloads
    .filter(w => w.workloadStatus === "overloaded")
    .map(w => ({
      userId: w.userId,
      userName: w.userName,
      message: `You have ${w.overdueTasks} overdue tasks and ${w.dueSoon} due soon. That's a lot on the plate.`,
    }));

  return {
    timestamp: now.toISOString(),
    userWorkloads,
    criticalTasks,
    rescheduleSuggestions: suggestions,
    workloadAlerts,
  };
}

function calculatePriority(
  daysUntil: number,
  status: string
): "critical" | "high" | "medium" | "low" {
  if (daysUntil < 0) return "critical";
  if (daysUntil <= 1) return "critical";
  if (daysUntil <= 3) return "high";
  if (daysUntil <= 7) return "medium";
  return "low";
}

function calculateWorkloads(
  tasks: TaskAnalysis[],
  users: User[]
): UserWorkload[] {
  const workloads = new Map<string, UserWorkload>();

  users.forEach(user => {
    workloads.set(user.id, {
      userId: user.id,
      userName: user.full_name || "Unknown",
      totalTasks: 0,
      overdueTasks: 0,
      dueSoon: 0,
      averageCompletionDays: 0,
      workloadStatus: "balanced",
    });
  });

  tasks.forEach(task => {
    const workload = workloads.get(task.assigneeId);
    if (workload) {
      workload.totalTasks++;
      if (task.isOverdue) workload.overdueTasks++;
      if (task.daysUntilDeadline <= 3 && task.daysUntilDeadline >= 0)
        workload.dueSoon++;
    }
  });

  // Determine workload status
  workloads.forEach(workload => {
    if (workload.overdueTasks >= 2 || workload.totalTasks >= 10) {
      workload.workloadStatus = "overloaded";
    } else if (workload.totalTasks <= 2) {
      workload.workloadStatus = "light";
    }
  });

  return Array.from(workloads.values());
}

function generateSuggestions(
  tasks: TaskAnalysis[],
  workloads: UserWorkload[],
  historicalData?: any
): TaskAnalysis[] {
  const suggestions: TaskAnalysis[] = [];

  // Find overdue tasks with overloaded assignees
  tasks
    .filter(t => t.isOverdue || t.daysUntilDeadline < 0)
    .forEach(task => {
      const userWorkload = workloads.find(w => w.userId === task.assigneeId);
      if (userWorkload && userWorkload.workloadStatus === "overloaded") {
        // Suggest rescheduling to a lighter colleague or extending deadline
        const lightCollague = workloads.find(
          w => w.workloadStatus === "light" && w.userId !== task.assigneeId
        );

        suggestions.push({
          ...task,
          reason: `You're swamped. Why are you late on this? Should we move the deadline or reassign it?`,
          suggestedNewDeadline: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split("T")[0],
        });
      }
    });

  // Find tasks due soon with overloaded assignees
  tasks
    .filter(t => t.daysUntilDeadline <= 3 && t.daysUntilDeadline >= 0)
    .forEach(task => {
      const userWorkload = workloads.find(w => w.userId === task.assigneeId);
      if (userWorkload && userWorkload.workloadStatus === "overloaded") {
        suggestions.push({
          ...task,
          reason: `This is due in ${task.daysUntilDeadline} days, but you've got a lot on. Realistic?`,
          suggestedNewDeadline: new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split("T")[0],
        });
      }
    });

  return suggestions;
}
