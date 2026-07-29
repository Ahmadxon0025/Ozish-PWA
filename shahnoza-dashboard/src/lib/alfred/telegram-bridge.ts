import "server-only";
import { AlfredChatService, type ConversationMessage } from "@/lib/alfred/chat-service";
import { AlfredActionExecutor } from "@/lib/alfred/action-executor";
import { buildWorkspaceContextForChat } from "@/lib/alfred/workspace-context";
import { buildBusinessSnapshot } from "@/lib/alfred/workspace-data";
import { executeDataTool } from "@/lib/alfred/data-tools";

export interface TelegramAlfredResult {
  text: string;
  /** alfred_action_log ids of executed actions (undo handles). */
  logIds: string[];
}

/**
 * Run one Alfred exchange initiated from Telegram. The admin client is used
 * throughout (there is no user session on the webhook path); attribution and
 * undo authorship come from mapping the sender's telegram_id to users.id.
 * Unlinked senders get answers but no action execution.
 */
export async function runAlfredFromTelegram(opts: {
  db: any;
  telegramUserId: string | null;
  chatId: string | number;
  message: string;
}): Promise<TelegramAlfredResult> {
  const { db, telegramUserId, chatId, message } = opts;

  // Resolve the sender to an app user (actions require this)
  let appUser: { id: string; full_name: string | null } | null = null;
  if (telegramUserId) {
    const { data } = await db
      .from("users")
      .select("id, full_name")
      .eq("telegram_id", telegramUserId)
      .maybeSingle();
    appUser = data ?? null;
  }

  // Workspace context — same builders the web app uses
  const context = await buildWorkspaceContextForChat(db);
  context.currentUserName = appUser?.full_name ?? undefined;
  context.today = new Date(Date.now() + 5 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  try {
    context.business = await buildBusinessSnapshot(db);
  } catch (error) {
    console.error("Business snapshot failed (telegram):", error);
  }
  try {
    const { data: memories } = await db
      .from("alfred_memories")
      .select("content, category")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(40);
    context.memories = memories ?? [];
  } catch {
    // memories are best-effort
  }

  // Conversation continuity: one active thread per user per Telegram chat
  const title = `tg:${chatId}`;
  let conversation: { id: string; messages: any[] } | null = null;
  if (appUser) {
    const { data } = await db
      .from("alfred_conversations")
      .select("id, messages")
      .eq("user_id", appUser.id)
      .eq("title", title)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversation = data ?? null;
  }
  const history: ConversationMessage[] = Array.isArray(conversation?.messages)
    ? (conversation!.messages as any[])
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .slice(-12)
        .map((m) => ({ role: m.role, content: String(m.content ?? "") }))
    : [];

  const chatService = new AlfredChatService();
  const response = await chatService.chat(message, context, history, (name, input) =>
    executeDataTool(db, name, input)
  );

  // Persist the exchange (best-effort)
  const newMessages = [
    ...(Array.isArray(conversation?.messages) ? conversation!.messages : []),
    { role: "user", content: message, at: new Date().toISOString() },
    { role: "assistant", content: response.message, at: new Date().toISOString() },
  ].slice(-40);
  let conversationId: string | null = conversation?.id ?? null;
  if (appUser) {
    try {
      if (conversation) {
        await db
          .from("alfred_conversations")
          .update({ messages: newMessages, updated_at: new Date().toISOString() })
          .eq("id", conversation.id);
      } else {
        const { data: created } = await db
          .from("alfred_conversations")
          .insert({ user_id: appUser.id, title, messages: newMessages })
          .select("id")
          .single();
        conversationId = created?.id ?? null;
      }
    } catch (error) {
      console.error("Telegram conversation persist failed:", error);
    }
  }

  // Execute proposed actions — linked users only
  const lines: string[] = [response.message.trim()];
  const logIds: string[] = [];
  if (response.proposal?.actions?.length) {
    if (!appUser) {
      lines.push(
        "",
        "⚠️ *Bajarilmadi* — bu amalni yozib qo'yishim uchun Telegram akkauntingiz tizimga bog'lanishi kerak.",
        telegramUserId
          ? `Sizning Telegram ID: \`${telegramUserId}\``
          : "Telegram ID aniqlanmadi.",
        "Ulash: ilovada *Sozlamalar → Profil → Telegram ID* ga shu raqamni yozib saqlang. Keyin qayta yozing.",
      );
    } else {
      const executor = new AlfredActionExecutor(db, appUser.id);
      for (const action of response.proposal.actions) {
        const result = await executor.execute({
          conversationId,
          actionId: action.id,
          actionType: action.type,
          data: action.data ?? {},
        });
        lines.push(
          "",
          `${result.success ? "✅" : "❌"} ${result.message || result.error || "Bajarildi"}`,
        );
        if (result.logId) logIds.push(result.logId);
      }
      if (logIds.length > 0) {
        lines.push("", "↩️ Bekor qilish: shu xabarga *bekor* deb reply qiling.");
      }
    }
  }

  // Telegram hard limit is 4096 chars; leave headroom
  let text = lines.join("\n").trim();
  if (text.length > 3800) text = text.slice(0, 3800) + "…";
  return { text, logIds };
}
