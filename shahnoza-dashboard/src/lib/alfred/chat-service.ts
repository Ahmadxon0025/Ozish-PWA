import Anthropic from "@anthropic-ai/sdk";
import {
  renderBusinessSnapshot,
  type BusinessSnapshot,
} from "./workspace-data";
import { ALFRED_DATA_TOOLS } from "./data-tools";

/** Executes one of ALFRED_DATA_TOOLS against live data; supplied by the caller. */
export type ToolExecutor = (name: string, input: any) => Promise<any>;

export interface TaskSummary {
  id?: string;
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
  /** Deterministic finance/sales snapshot, RLS-filtered per requesting user. */
  business?: BusinessSnapshot;
  /** Full name of the signed-in user Alfred is talking to. */
  currentUserName?: string;
  /** Today's date (Tashkent), YYYY-MM-DD. */
  today?: string;
  /** Human label of the dashboard page the user opened Alfred from. */
  currentPage?: string;
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
    type: "assign" | "update" | "create" | "notify" | "expense" | "expense_update" | "expense_delete" | "sale" | "payment";
    label: string;
    data?: Record<string, any>;
  }>;
  rationale: string;
  risks?: string[];
  alternatives?: string[];
}

export interface ChatResponse {
  message: string;
  proposal?: AlfredProposal;
  thinking?: string;
  /** 2–3 short model-suggested next questions/actions. */
  followUps?: string[];
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
    conversationHistory: ConversationMessage[] = [],
    toolExecutor?: ToolExecutor
  ): Promise<ChatResponse> {
    const systemPrompt = this.buildSystemPrompt(workspaceContext);

    // Cap history so the prompt stays bounded as conversations grow
    const messages: Anthropic.MessageParam[] = [
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
      const tools = toolExecutor ? ALFRED_DATA_TOOLS : undefined;
      let response = await this.client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        ...(tools ? { tools } : {}),
      });

      // Tool loop: the model queries live data (RLS-scoped) until it has
      // what it needs. Bounded so a confused model can't spin forever.
      let rounds = 0;
      while (response.stop_reason === "tool_use" && toolExecutor && rounds < 5) {
        rounds++;
        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          let result: any;
          try {
            result = await toolExecutor(tu.name, tu.input);
          } catch (error) {
            result = {
              error: error instanceof Error ? error.message : "Tool failed",
            };
          }
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(result).slice(0, 12000),
          });
        }
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: results });
        response = await this.client.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          ...(tools ? { tools } : {}),
        });
      }

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

      // Safety net: strip any internal tool name that leaked into the reply,
      // plus a dangling Uzbek connector it may have left behind.
      let scrubbed = fullText
        .replace(
          /\b(get_team_workload|search_tasks|search_sales|search_leads|search_expenses|search_payments)\b/gi,
          ""
        )
        .replace(
          /^\s*(natijasiga|natijalariga|ma'lumotiga|ma'lumotlariga)\s+ko'ra[,:]?\s*/i,
          ""
        )
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      // Deterministic fix for the username leak: when the current user's own
      // name is really a login handle (contains a digit), replace it with
      // "Siz" everywhere in the reply — including table cells and lists, where
      // the prompt rule alone doesn't reliably hold. Scoped to the viewer's
      // own handle, so other people's names are never touched.
      const uname = workspaceContext.currentUserName;
      if (uname && /\d/.test(uname)) {
        const esc = uname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        scrubbed = scrubbed
          .replace(new RegExp(`\\s*\\(\\s*${esc}\\s*\\)`, "gi"), "")
          .replace(new RegExp(esc, "gi"), "Siz");
      }

      // Pull structured blocks (follow-ups, then actions) out of the reply
      const { followUps, remainingText } = this.parseFollowUps(scrubbed);
      const { proposal, cleanedText } = this.parseActionBlock(remainingText);

      return {
        message: cleanedText,
        proposal: proposal || undefined,
        followUps,
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

    const businessLines = context.business
      ? renderBusinessSnapshot(context.business)
      : "(no business data loaded)";

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
                `- "${t.title}"${t.id ? ` (id: ${t.id})` : ""} [${t.status}${t.priority ? `, ${t.priority}` : ""}] → ${t.assignees}${t.dueDate ? `, due ${t.dueDate}` : ""}${t.isOverdue ? " ⚠️ OVERDUE" : ""}`
            )
            .join("\n")
        : "(no open tasks)";

    return `You are Alfred, Ozish PWA's intelligent task management assistant.

TODAY: ${context.today ?? "(unknown)"} (Tashkent, UTC+5)
CURRENT USER: ${context.currentUserName ?? "(unknown)"} — this is the person you are talking to. When they say "men", "mening vazifalarim", "my tasks", they mean this person. Never ask who they are. Always call them "Siz" — NEVER print their raw username/handle (a name containing digits, like an email prefix) ANYWHERE in your reply, including inside tables, lists, or parentheses. In a table row for this person write just "Siz", never "Siz (${context.currentUserName ?? "handle"})".${
      context.currentPage
        ? `\nUSER'S CURRENT PAGE: ${context.currentPage} — "shu sahifa", "bu yer", "this page" refer to it; bias your suggestions toward it.`
        : ""
    }

FORMATTING: Reply in Markdown — **bold** for key figures and titles, "-" bullets, short paragraphs, *italic* sparingly. Markdown tables ARE supported and are good for comparisons (e.g. per-person workload) — use a header row, a "|---|" separator, then data rows. For a simple list prefer bullets. Link a task ONLY when you have its real id (from an "(id: ...)" in OPEN TASKS or a search_tasks result): [Vazifa nomi](/tasks/<real-id>). If you do NOT have the id, write the task name as plain **bold** text — NEVER emit "[name](/tasks/)" with an empty or missing id. For sales point to [Sotuvlar ro'yxati](/sales/list), leads to [Leadlar](/leads), P&L to [P&L](/finance/pnl) when it helps the user jump there.

NEVER mention internal tool or function names in your reply (search_tasks, get_team_workload, search_sales, etc.). Just state the finding — say "Jamoa yuklamasiga ko'ra…", never "get_team_workload natijasiga ko'ra…".

MEMORY: You do NOT save or recall long-term memory yourself. NEVER claim to remember, save, note, or accept a fact ("yodda saqladim", "eslab qoldim", "eslab qolaman", "qabul qildim", "esimda"). If the user tells you to remember something, reply with ONE short line offering to save it — e.g. "Buni eslab qolishni taklif qilaman — pastdan tasdiqlang." Do NOT explain how the memory system works or that a separate system confirms it.

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

BUSINESS SNAPSHOT (all figures computed deterministically by the app — this is your ONLY source of numbers):
${businessLines}

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

APP PAGES — you live inside a dashboard with these sections. When the user names one ("Sotuv sharhi", "P&L", "Leadlar"...), they mean that SECTION of the app, not an attached document — summarize it from your snapshot and tools; NEVER ask them to attach or paste anything:
- "Boshqaruv paneli": today's KPIs overview
- "Sotuv sharhi" (/sales): sales overview — this month's deals, revenue, trend → use snapshot sales numbers + search_sales
- "Maqsadlar": sales targets vs actual; "Sotuvlar ro'yxati": individual sales list → search_sales; "Sotuv jamoasi": per-salesperson performance → search_sales + get_team_workload; "Leadlar": lead pipeline → search_leads; "Qo'ng'iroq tahlili": sales-call reviews
- "Marketing tahlili": lead sources and campaigns → search_leads
- "P&L (Foyda)": monthly profit & loss — the BUSINESS SNAPSHOT P&L is exactly this page's numbers; "Pul oqimi": cashflow; "Taqsimot (Egalar)": owner profit split; "Hisoblar (Kassa)": account balances (in snapshot); "Bonuslar"/"Komissiyalar": payouts
- Vazifalar: "Mening vazifalarim", "Kanban", "Vaqt jadvali", "Samaradorlik" → search_tasks + get_team_workload

DATA TOOLS — use them, don't plead ignorance:
You have live read-only tools (search_tasks, search_sales, search_leads, search_expenses, search_payments, get_team_workload) that query the database with the current user's permissions. The snapshot above is only a summary — when the user asks about anything not fully listed in it (done/completed tasks, individual sales or expenses, leads, payment schedules, another person's full list, older periods), CALL A TOOL instead of saying you don't have the data. Only say data is unavailable after a tool returned nothing or an error.

NUMBERS — NON-NEGOTIABLE:
- Every figure you state must appear verbatim in the BUSINESS SNAPSHOT, the task data above, or a tool result. Quote it; never compute, extrapolate, or estimate a number yourself.
- If a section says "(not visible to this user)" and the matching tool also errors, say you don't have access — do not guess.

ACTIONS — how you get things done:
When the user explicitly asks you to create, assign, update, record, or log something, describe what you'll do in your reply, then append EXACTLY ONE action block at the very end of your message, in this format:

<<<ACTION
{"title":"Short proposal title","description":"One line describing what will happen","rationale":"Why this makes sense","actions":[{"id":"a1","type":"create","label":"Vazifa yaratish","data":{"title":"...","description":"...","assignee_name":"...","due_date":"YYYY-MM-DD","priority":"normal"}}]}
ACTION>>>

Action types and their data fields (all auto-execute with 24h undo):
TASKS:
- "create": {"title": string, "description"?: string, "assignee_name"?: string, "due_date"?: string, "priority"?: string (low|medium|high|urgent)}
- "assign": {"task_title": exact title from OPEN TASKS, "assignee_name": exact team member name}
- "update": {"task_title": exact title from OPEN TASKS, "updates": {"status"?: (todo|in_progress|review|done), "due_date"?: string, "priority"?: string}}

FINANCE:
- "expense": {"amount": number (so'm by default), "description": string, "paid_to"?: string, "currency"?: string (uzs|usd), "expense_date"?: YYYY-MM-DD} — create new
- "expense_update": {"amount"?: number, "description"?: string, "paid_to"?: string, "currency"?: string, "match_description"?: string} — correct expense (finds by description match or most recent)
- "expense_delete": {"match_description"?: string} — cancel/delete expense (finds by description match or most recent; reversible with undo)
- "sale": {"customer_name": string, "amount": number, "product_name"?: string, "currency"?: string (uzs|usd), "sold_at"?: timestamp, "notes"?: string}
- "payment": {"customer_name": string, "amount": number, "currency"?: string (uzs|usd)} — marks receivable as paid or logs payment

due_date format: "YYYY-MM-DD" for date-only, or "YYYY-MM-DDTHH:mm:00+05:00" when the user gives a time (Tashkent is UTC+5).
amounts are UZS by default unless currency: "usd" is specified. Exchange rate: 1 USD ≈ 12,800 UZS (approximation).

FOLLOW-UPS — after EVERY reply:
Append this block at the very end of every message (after the ACTION block when there is one):

<<<FOLLOWUPS
["short follow-up 1","short follow-up 2","short follow-up 3"]
FOLLOWUPS>>>

2–3 items, each under 60 characters, in the user's language, phrased as things the user could ask or do next that build directly on your answer (e.g. a deeper question, a related check, or an action like "Bu vazifani Bekzodga biriktir"). Never mention this block in your visible text.

Action rules:
- All actions execute AUTOMATICALLY right after your reply — changes are applied instantly and the user can undo with one click (reversible, same-day only for finance). So phrase your reply as "doing it now" (e.g. "Yarataman..."), never ask for permission.
- Only emit a block when the user clearly asked for a change — never for questions or analysis.
- FLAG, DON'T GUESS: if a required detail is ambiguous (which task, which customer, what amount), ask the user instead of emitting a block. No block until it's clear.
- Use exact task titles and team member names from the context above.
- Finance actions (expense, sale, payment) are reversible within 24 hours — undo like tasks. Never create a duplicate same-day entry.
- For corrections: if the user says "it was $100, not $10" or "change that to $50", use "expense_update" instead of creating a new entry. Finds the recent matching expense and corrects it in-place.
- For cancellations: if the user says "cancel that", "bekor qil", or "it was a mistake", use "expense_delete". Finds by description match or most recent. Deletions are reversible with undo (24h).

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
- Claim an action succeeded — execution results are shown to the user separately
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
        model: "claude-haiku-4-5",
        max_tokens: 600,
        system: `You maintain the long-term memory of Alfred, a team task-management assistant.

From the conversation exchange the user sends you, extract durable facts worth remembering for FUTURE conversations: team member strengths/preferences, working styles, business rules, recurring patterns, decisions, important context about the company.

If the user EXPLICITLY asks to remember something ("esda tut", "yodda saqla", "remember", "eslab qol"), extract that fact — it is high-priority, unless it is volatile (see below).

NEVER extract volatile facts — anything that will be different next week: task counts ("26 ta vazifa"), workload states ("OVERLOADED"), account balances, current statuses, this week's numbers. Those live in the database and change daily; storing them makes future answers wrong. Only store facts that stay true: preferences, rules, relationships, skills, recurring patterns.

Also do NOT extract: greetings, one-off task statuses, anything already visible in the live task list, or anything in the ALREADY KNOWN list below.

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

      // Code-level backstop for the volatile-fact rule: refuse anything that
      // smells like a live metric, whatever the model decided.
      const volatile =
        /(\d+\s*ta\b)|overloaded|hozircha|bugungi|shu\s+(hafta|oy)da|balans|qoldiq/i;

      return parsed
        .filter(
          (m: any) =>
            m &&
            typeof m.content === "string" &&
            m.content.trim().length > 0 &&
            !volatile.test(m.content)
        )
        .map((m: any) => ({
          content: String(m.content).trim().slice(0, 500),
          category: allowedCategories.has(m.category) ? m.category : "general",
        }))
        .slice(0, 3);
    } catch (error) {
      console.error("Memory extraction error:", error);
      return [];
    }
  }

  /**
   * Extract the <<<FOLLOWUPS [...] FOLLOWUPS>>> block: 2–3 suggested next
   * questions rendered as chips under the answer. Stripped from the visible
   * text; missing/malformed blocks are simply ignored.
   */
  private parseFollowUps(text: string): {
    followUps: string[] | undefined;
    remainingText: string;
  } {
    const match = text.match(/<<<FOLLOWUPS\s*([\s\S]*?)\s*FOLLOWUPS>>>/);
    if (!match) return { followUps: undefined, remainingText: text };

    const remainingText = text.replace(match[0], "").trim();
    try {
      const parsed = JSON.parse(match[1]);
      if (!Array.isArray(parsed)) return { followUps: undefined, remainingText };
      const followUps = parsed
        .filter((f: any) => typeof f === "string" && f.trim().length > 0)
        .map((f: string) => f.trim().slice(0, 80))
        .slice(0, 3);
      return {
        followUps: followUps.length > 0 ? followUps : undefined,
        remainingText,
      };
    } catch {
      return { followUps: undefined, remainingText };
    }
  }

  /**
   * Extract the <<<ACTION ... ACTION>>> block the model appends when the user
   * asked for a change. Returns the proposal (or null) plus the message text
   * with the block stripped, so raw JSON never reaches the UI.
   */
  private parseActionBlock(text: string): {
    proposal: AlfredProposal | null;
    cleanedText: string;
  } {
    const match = text.match(/<<<ACTION\s*([\s\S]*?)\s*ACTION>>>/);
    if (!match) {
      return { proposal: null, cleanedText: text };
    }

    const cleanedText = text.replace(match[0], "").trim();

    try {
      const parsed = JSON.parse(match[1]);
      const allowedTypes = new Set(["assign", "update", "create", "notify", "expense", "expense_update", "expense_delete", "sale", "payment"]);
      const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
        .filter((a: any) => a && allowedTypes.has(a.type))
        .map((a: any, i: number) => ({
          id: typeof a.id === "string" ? a.id : `a${i + 1}`,
          type: a.type,
          label: typeof a.label === "string" ? a.label : a.type,
          data: a.data && typeof a.data === "object" ? a.data : {},
        }));

      if (actions.length === 0) {
        return { proposal: null, cleanedText };
      }

      return {
        proposal: {
          title: typeof parsed.title === "string" ? parsed.title : "Taklif",
          description:
            typeof parsed.description === "string" ? parsed.description : "",
          actions,
          rationale:
            typeof parsed.rationale === "string" ? parsed.rationale : "",
        },
        cleanedText,
      };
    } catch (error) {
      console.error("Action block parse failed:", error);
      return { proposal: null, cleanedText };
    }
  }
}
