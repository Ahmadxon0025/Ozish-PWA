import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { toUsd } from "@/lib/business/currency";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import {
  insertAccountEntry,
  resolveDefaultAccountId,
  deleteRelatedEntries,
} from "@/lib/business/account-posting";
import { todayKey } from "@/lib/dates";
import { formatUsd } from "@/lib/format";
import { sendMessage } from "./bot";
import { parseExpense, isExpenseTrigger } from "./parse-expense";
import type { Database } from "@/types/database";

type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];
type AdminDb = ReturnType<typeof requireAdminClient>;

// Match an account named in the message (e.g. "... visa" / "... naqd"),
// otherwise fall back to the first account of the right currency.
const ACCOUNT_ALIASES: [RegExp, string[]][] = [
  [/\bvisa\b|виза|виз/i, ["visa"]],
  [/\bnaqd\b|\bcash\b|нал/i, ["naqd", "cash"]],
  [/\bkarta\b|\bcard\b|карта/i, ["karta", "card"]],
  [/\bfirma\b|фирма|firm/i, ["firma", "firm"]],
];

async function resolveAccountForMessage(
  db: AdminDb,
  text: string,
  currency: "UZS" | "USD",
): Promise<string | null> {
  const { data: accounts } = await db
    .from("accounts")
    .select("id, name, currency, kind")
    .eq("is_active", true);
  const list = accounts ?? [];

  for (const [re, needles] of ACCOUNT_ALIASES) {
    if (re.test(text)) {
      const match = list.find((a) => {
        const hay = `${a.name} ${a.kind ?? ""}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      });
      if (match) return match.id;
    }
  }
  return resolveDefaultAccountId(db, currency);
}

const HELP = [
  "🤖 *Moliya boti*",
  "",
  "Xarajat qo'shish uchun shunday yozing:",
  "`rasxod 50$ facebook reklama`",
  "`rasxod 500000 video montaj`",
  "",
  "Tahrirlash: bot javobiga *reply* qilib yozing:",
  "`60$` — summani o'zgartiradi",
  "`instagram` — kategoriyani o'zgartiradi",
  "`o'chir` — xarajatni o'chiradi",
  "",
  "`/id` — shu guruh ID sini ko'rsatadi",
].join("\n");

async function findCategoryId(db: ReturnType<typeof requireAdminClient>, name: string | null) {
  const target = name ?? "Boshqa";
  const { data } = await db
    .from("expense_categories")
    .select("id, name")
    .eq("name", target)
    .maybeSingle();
  if (data) return { id: data.id, name: data.name ?? target };
  // fallback to Boshqa
  const { data: other } = await db
    .from("expense_categories")
    .select("id, name")
    .eq("name", "Boshqa")
    .maybeSingle();
  return other ? { id: other.id, name: other.name ?? "Boshqa" } : null;
}

interface TgMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type?: string };
  from?: { id: number; first_name?: string; username?: string };
  reply_to_message?: { message_id: number };
}

/** Process one Telegram update. Best-effort; never throws to the caller. */
export async function handleTelegramUpdate(update: unknown): Promise<void> {
  const u = update as { message?: TgMessage; edited_message?: TgMessage };
  const msg = u.message ?? u.edited_message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const fromId = msg.from?.id != null ? String(msg.from.id) : null;

  // --- Commands ---
  if (/^\/(id|chatid)\b/i.test(text)) {
    await sendMessage(chatId, `🆔 Chat ID: \`${chatId}\``, {
      replyToMessageId: msg.message_id,
    });
    return;
  }
  if (/^\/(start|help)\b/i.test(text)) {
    await sendMessage(chatId, HELP, { replyToMessageId: msg.message_id });
    return;
  }

  const db = requireAdminClient();

  // --- Edit / delete: a reply to a tracked expense message ---
  if (msg.reply_to_message) {
    const rid = msg.reply_to_message.message_id;
    const { data: expense } = await db
      .from("expenses")
      .select("*")
      .eq("telegram_chat_id", String(chatId))
      .or(`telegram_message_id.eq.${rid},telegram_confirm_message_id.eq.${rid}`)
      .maybeSingle();

    if (expense) {
      const parsed = parseExpense(text);

      if (parsed.isDelete) {
        await deleteRelatedEntries(db, "expense", expense.id);
        await db.from("expenses").delete().eq("id", expense.id);
        await sendMessage(chatId, "🗑 Xarajat o'chirildi.", {
          replyToMessageId: msg.message_id,
        });
        return;
      }

      const editRate = await getCurrentRate(db);
      const patch: ExpenseUpdate = {};
      if (parsed.hasAmount && parsed.amount != null) {
        patch.amount = parsed.amount;
        patch.currency = parsed.currency;
        patch.amount_usd = toUsd(parsed.amount, parsed.currency, editRate.rate);
      }
      let categoryName: string | null = null;
      if (parsed.categoryName) {
        const cat = await findCategoryId(db, parsed.categoryName);
        if (cat) {
          patch.category_id = cat.id;
          categoryName = cat.name;
        }
      }
      if (parsed.description && parsed.description.length > 1) {
        patch.description = parsed.description;
      }

      if (Object.keys(patch).length === 0) {
        await sendMessage(
          chatId,
          "❓ Nima o'zgartirishni tushunmadim. Masalan: `60$` yoki `instagram` yoki `o'chir`.",
          { replyToMessageId: msg.message_id },
        );
        return;
      }

      await db.from("expenses").update(patch).eq("id", expense.id);

      // If the amount changed, re-sync the linked account movement.
      if (patch.amount_usd != null && expense.account_id) {
        await deleteRelatedEntries(db, "expense", expense.id);
        await insertAccountEntry(db, {
          accountId: expense.account_id,
          direction: "out",
          kind: "expense",
          amountUsd: Number(patch.amount_usd),
          amountUzs: patch.currency === "UZS" ? Number(patch.amount) : null,
          rate: editRate.rate,
          description: expense.description ?? "Xarajat",
          relatedType: "expense",
          relatedId: expense.id,
          createdBy: expense.created_by,
          occurredAt: `${expense.expense_date}T12:00:00Z`,
        });
      }

      const newUsd =
        patch.amount_usd != null ? Number(patch.amount_usd) : Number(expense.amount_usd ?? 0);
      await sendMessage(
        chatId,
        `✏️ *Tahrirlandi:* ${formatUsd(newUsd)}${categoryName ? ` — ${categoryName}` : ""}`,
        { replyToMessageId: msg.message_id },
      );
      return;
    }
    // replied to something untracked — fall through (maybe it's still an expense)
  }

  // --- New expense ---
  if (isExpenseTrigger(text)) {
    const parsed = parseExpense(text);
    if (!parsed.hasAmount || parsed.amount == null) {
      await sendMessage(
        chatId,
        "❓ Summani topolmadim. Masalan: `rasxod 50$ facebook`",
        { replyToMessageId: msg.message_id },
      );
      return;
    }

    const cat = await findCategoryId(db, parsed.categoryName);
    const rate = await getCurrentRate(db);
    const amountUsd = toUsd(parsed.amount, parsed.currency, rate.rate);
    const accountId = await resolveAccountForMessage(db, text, parsed.currency);

    let createdBy: string | null = null;
    if (fromId) {
      const { data: user } = await db
        .from("users")
        .select("id")
        .eq("telegram_id", fromId)
        .maybeSingle();
      createdBy = user?.id ?? null;
    }

    const { data: inserted } = await db
      .from("expenses")
      .insert({
        category_id: cat?.id ?? null,
        amount: parsed.amount,
        currency: parsed.currency,
        amount_usd: amountUsd,
        description: parsed.description || cat?.name || null,
        expense_date: todayKey(),
        created_by: createdBy,
        source: "telegram",
        account_id: accountId,
        telegram_chat_id: String(chatId),
        telegram_message_id: msg.message_id,
        telegram_user_id: fromId,
      })
      .select("id")
      .single();

    // Deduct from the account (money out) + fetch its name for the reply.
    let accountName: string | null = null;
    if (inserted && accountId) {
      await insertAccountEntry(db, {
        accountId,
        direction: "out",
        kind: "expense",
        amountUsd,
        amountUzs: parsed.currency === "UZS" ? parsed.amount : null,
        rate: rate.rate,
        description: parsed.description || cat?.name || "Xarajat",
        relatedType: "expense",
        relatedId: inserted.id,
        createdBy,
        occurredAt: `${todayKey()}T12:00:00Z`,
      });
      const { data: acct } = await db
        .from("accounts")
        .select("name")
        .eq("id", accountId)
        .maybeSingle();
      accountName = acct?.name ?? null;
    }

    const confirmId = await sendMessage(
      chatId,
      [
        `✅ *Xarajat qo'shildi*`,
        `${formatUsd(amountUsd)} — ${cat?.name ?? "Boshqa"}`,
        parsed.description ? `_${parsed.description}_` : "",
        accountName ? `💳 ${accountName}` : "",
        "",
        `Tahrirlash: shu xabarga *reply* qiling (\`60$\` · \`instagram\` · \`o'chir\`).`,
      ]
        .filter(Boolean)
        .join("\n"),
      { replyToMessageId: msg.message_id },
    );

    if (inserted && confirmId) {
      await db
        .from("expenses")
        .update({ telegram_confirm_message_id: confirmId })
        .eq("id", inserted.id);
    }
    return;
  }

  // Anything else in the group is ignored (no spam).
}
