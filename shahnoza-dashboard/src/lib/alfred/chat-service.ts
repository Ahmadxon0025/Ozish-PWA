import Anthropic from "@anthropic-ai/sdk";

export interface TaskSummary {
  title: string;
  status: string;
  assignees: string;
  dueDate: string | null;
  priority: string | null;
  isOverdue: boolean;
}

export interface MemoryEntry {
  content: string;
  category: string;
}

export interface WorkspaceContext {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    unassigned: number;
    overdue: number;
  };
  taskList: TaskSummary[];
  /** Long-term learnings loaded from alfred_memories, newest first. */
  memories?: MemoryEntry[];
  users: Array<{
    id: string;
    name: string;
    taskCount: number;
    isOverloaded: boolean;
  }>;
  metrics: {
    teamVelocity: number;
    completionRate: number;
    averageDelay: number;
  };
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AlfredProposal {
  title: string;
  description: string;
  actions: Array<{
    id: string;
    type: "assign" | "update" | "create" | "notify";
    label: string;
  }>;
  rationale: string;
  risks?: string[];
  alternatives?: string[];
}

export interface ChatResponse {
  message: string;
  proposal?: AlfredProposal;
  thinking?: string;
}

export class AlfredChatService {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.error("ANTHROPIC_API_KEY is not set in environment variables");
    }
    this.client = new Anthropic({
      apiKey: key,
    });
  }

  async chat(
    userMessage: string,
    workspaceContext: WorkspaceContext,
    conversationHistory: ConversationMessage[] = []
  ): Promise<ChatResponse> {
    const systemPrompt = this.buildSystemPrompt(workspaceContext);

    // Cap history so the prompt stays bounded as conversations grow
    const messages = [
      ...conversationHistory.slice(-20).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: userMessage,
      },
    ];

    try {
      const response = await this.client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages,
      });

      // The model may return thinking or other block types before the text
      // block, so collect every text block instead of assuming content[0].
      const fullText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!fullText) {
        throw new Error("Model returned no text content");
      }

      // Only surface a proposal card when there are executable actions —
      // otherwise it just duplicates the message text.
      const proposal = this.parseProposal(fullText);

      return {
        message: fullText,
        proposal:
          proposal && proposal.actions.length > 0 ? proposal : undefined,
      };
    } catch (error) {
      console.error("Alfred chat error:", error);
      throw error;
    }
  }

  private buildSystemPrompt(context: WorkspaceContext): string {
    const tasksByStatus = Object.entries(context.tasks.byStatus)
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");

    const userList = context.users
      .map(
        (u) =>
          `${u.name} (${u.taskCount} tasks${u.isOverloaded ? " - OVERLOADED" : ""})`
      )
      .join(", ");

    const memoryLines =
      context.memories && context.memories.length > 0
        ? context.memories
            .map((m) => `- [${m.category}] ${m.content}`)
            .join("\n")
        : "(no saved memories yet)";

    const taskLines =
      context.taskList.length > 0
        ? context.taskList
            .map(
              (t) =>
                `- "${t.title}" [${t.status}${t.priority ? `, ${t.priority}` : ""}] → ${t.assignees}${t.dueDate ? `, due ${t.dueDate}` : ""}${t.isOverdue ? " ⚠️ OVERDUE" : ""}`
            )
            .join("\n")
        : "(no open tasks)";

    return `You are Alfred, Ozish PWA's intelligent task management assistant.

YOUR ROLE:
- Analyze team workload and task assignments
- Make smart recommendations for task distribution
- Provide actionable insights and bottleneck detection
- Help organize team work efficiently

YOUR CAPABILITIES:
- Read and analyze: All tasks, users, workload data, team analytics
- Understand context: Team patterns, individual strengths, capacity
- Recommend: Smart task assignments, workflow improvements
- Propose: Multi-step plans with clear reasoning

WORKSPACE STATE:
Tasks: ${context.tasks.total} total
  Status breakdown: ${tasksByStatus}
  Unassigned: ${context.tasks.unassigned}
  Overdue: ${context.tasks.overdue}

Team (${context.users.length} members):
  ${userList}

Team Metrics:
  Velocity: ${context.metrics.teamVelocity} tasks/day
  Completion Rate: ${context.metrics.completionRate}%
  Average Delay: ${context.metrics.averageDelay} days

OPEN TASKS (most recent first):
${taskLines}

LEARNED MEMORY (long-term knowledge accumulated from past conversations — treat as reliable context):
${memoryLines}

IMPORTANT RULES:
1. ALWAYS be helpful and professional
2. SHOW reasoning: "Why?" behind recommendations
3. CONSIDER context: workload, expertise, deadlines
4. SURFACE risks: "This might be risky because..."
5. SUGGEST alternatives: "Or we could..."
6. USE TEAM NAMES naturally (Uzbek names are OK)
7. BE HONEST: Say if something isn't possible
8. ANSWER in the same language the user writes in (Uzbek or English)
9. ANSWER whatever is asked using the workspace data above — cite real task titles, assignees, and due dates

RESPONSE STYLE:
- Start with direct answer or analysis
- Show relevant data/context
- Offer recommendations with reasoning
- Mention risks and alternatives
- End with actionable next steps

Example good response:
"📊 Workload Check:
Raximjon has 14 tasks (8 overdue)
Sayid has 8 tasks (normal)
Bekzod has 5 tasks (light)

💡 Suggestion: Move 2-3 from Raximjon to free him up?
   Sayid has capacity, or we could load Bekzod with 2 quick tasks.

⚠️  Risk: His overdue items need attention first.
🔄 Alternative: Just get him help on the overdue ones?

What's your preference?"

NEVER:
- Make up data or statistics
- Promise to execute actions (just analyze/suggest)
- Make personal judgments about team members
- Ignore the workspace context provided`;
  }

  /**
   * Second-pass extraction: pull durable, reusable facts out of one chat
   * exchange so they can be stored in alfred_memories and injected into
   * future conversations. Returns [] when nothing is worth remembering
   * or on any failure — memory must never break the chat itself.
   */
  async extractMemories(
    userMessage: string,
    assistantReply: string,
    knownMemories: string[]
  ): Promise<MemoryEntry[]> {
    try {
      const known =
        knownMemories.length > 0
          ? knownMemories
              .slice(0, 60)
              .map((m) => `- ${m}`)
              .join("\n")
          : "(none)";

      const response = await this.client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 600,
        system: `You maintain the long-term memory of Alfred, a team task-management assistant.

From the conversation exchange the user sends you, extract durable facts worth remembering for FUTURE conversations: team member strengths/preferences, working styles, business rules, recurring patterns, decisions, important context about the company.

Do NOT extract: greetings, one-off task statuses, anything already visible in the live task list, or anything in the ALREADY KNOWN list below.

Write each memory in the language it was expressed in (Uzbek is fine). Keep each under 200 characters.

ALREADY KNOWN (never repeat these):
${known}

Respond with ONLY a JSON array, nothing else:
[{"content": "...", "category": "team|person|process|preference|general"}]
Respond with [] if nothing new is worth remembering.`,
        messages: [
          {
            role: "user",
            content: `User: ${userMessage}\n\nAlfred: ${assistantReply}`,
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];

      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];

      const allowedCategories = new Set([
        "team",
        "person",
        "process",
        "preference",
        "general",
      ]);

      return parsed
        .filter(
          (m: any) =>
            m && typeof m.content === "string" && m.content.trim().length > 0
        )
        .map((m: any) => ({
          content: String(m.content).trim().slice(0, 500),
          category: allowedCategories.has(m.category) ? m.category : "general",
        }))
        .slice(0, 5);
    } catch (error) {
      console.error("Memory extraction error:", error);
      return [];
    }
  }

  private parseProposal(text: string): AlfredProposal | null {
    // Look for proposal markers in the response
    const hasProposalKeywords = /suggest|recommend|propose|should|could|option|alternative/i.test(
      text
    );

    if (!hasProposalKeywords) {
      return null;
    }

    // Extract sections
    const titleMatch = text.match(/^[📊🎯💡]?\s*([^:\n]+)(?:\n|:)/);
    const title = titleMatch ? titleMatch[1].trim() : "Analysis & Recommendation";

    // Simple parsing of risks and alternatives
    const risks: string[] = [];
    const riskMatches = text.match(/⚠️\s*([^⚠️\n]+)/g) || [];
    riskMatches.forEach((match) => {
      risks.push(match.replace("⚠️", "").trim());
    });

    const alternatives: string[] = [];
    const altMatches = text.match(/🔄\s*Alternative[^:]*:\s*([^🔄⚠️\n]+)/g) || [];
    altMatches.forEach((match) => {
      alternatives.push(match.replace("🔄", "").replace(/Alternative[^:]*:/, "").trim());
    });

    return {
      title,
      description: text.substring(0, 200),
      actions: [],
      rationale: "Based on current team workload and capacity",
      risks: risks.length > 0 ? risks : undefined,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }
}
