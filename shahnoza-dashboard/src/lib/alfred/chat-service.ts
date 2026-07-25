import Anthropic from "@anthropic-ai/sdk";

export interface WorkspaceContext {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    unassigned: number;
    overdue: number;
  };
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
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async chat(
    userMessage: string,
    workspaceContext: WorkspaceContext,
    conversationHistory: ConversationMessage[] = []
  ): Promise<ChatResponse> {
    const systemPrompt = this.buildSystemPrompt(workspaceContext);

    const messages = [
      ...conversationHistory.map((m) => ({
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
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages,
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type");
      }

      const fullText = content.text;

      // Parse response for proposals
      const proposal = this.parseProposal(fullText);

      return {
        message: fullText,
        proposal: proposal || undefined,
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

IMPORTANT RULES:
1. ALWAYS be helpful and professional
2. SHOW reasoning: "Why?" behind recommendations
3. CONSIDER context: workload, expertise, deadlines
4. SURFACE risks: "This might be risky because..."
5. SUGGEST alternatives: "Or we could..."
6. USE TEAM NAMES naturally (Uzbek names are OK)
7. BE HONEST: Say if something isn't possible

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
