import "server-only";
import { randomUUID } from "node:crypto";
import { requireAdminClient } from "@/lib/supabase/admin";
import { toUsd, round2 } from "@/lib/business/currency";
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
import {
  isDepositTrigger,
  isTransferTrigger,
  isSaleTrigger,
  parseDeposit,
  parseTransfer,
  parseSale,
} from "./parse-command";
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

// --- Treasury command helpers (kirim / o'tkazma) ---
const ALIAS_NEEDLES: Record<string, string[]> = {
  visa: ["visa"],
  naqd: ["naqd", "cash"],
  karta: ["karta", "card"],
  firma: ["firma", "firm"],
};

function toUsdAt(amount: number, currency: string | null, rate: number): number {
  return currency === "USD" ? round2(amount) : round2(rate > 0 ? amount / rate : 0);
}

function groupThousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtMoney(amount: number, currency: string | null): string {
  return currency === "USD" ? formatUsd(amount) : `${groupThousands(amount)} so'm`;
}

async function resolveAccountByAlias(db: AdminDb, alias: string) {
  const { data: accounts } = await db
    .from("accounts")
    .select("id, name, currency, kind")
    .eq("is_active", true);
  const needles = ALIAS_NEEDLES[alias] ?? [alias];
  return (
    (accounts ?? []).find((a) => {
      const hay = `${a.name} ${a.kind ?? ""}`.toLowerCase();
      return needles.some((n) => hay.includes(n));
    }) ?? null
  );
}

async function accountBalance(db: AdminDb, accountId: string): Promise<number> {
  const { data } = await db
    .from("account_transactions")
    .select("direction, amount")
    .eq("account_id", accountId);
  let bal = 0;
  for (const r of data ?? []) bal += r.direction === "in" ? Number(r.amount) : -Number(r.amount);
  return round2(bal);
}

async function resolveCreatedBy(db: AdminDb, fromId: string | null): Promise<string | null> {
  if (!fromId) return null;
  const { data } = await db
    .from("users")
    .select("id")
    .eq("telegram_id", fromId)
    .maybeSingle();
  return data?.id ?? null;
}

const HELP = [
  "🤖 *Moliya boti*",
  "",
  "Xarajat qo'shish uchun shunday yozing:",
  "`rasxod 50$ facebook reklama`",
  "`rasxod 500000 video montaj`",
  "",
  "Sotuv qo'shish:",
  "`sotuv 379$ biznes click firma`",
  "",
  "Pul kirimi (hisobga):",
  "`kirim 6 mln firma`",
  "",
  "O'tkazma (hisoblar orasida):",
  "`o'tkazma 3 mln firma viza`",
  "",
  "Tahrirlash: bot javobiga *reply* qilib yozing:",
  "`60$` — summani o'zgartiradi",
  "`instagram` — kategoriyani o'zgartiradi",
  "`o'chir` — xarajatni o'chiradi",
  "",
  "📋 *Vazifalar:*",
  "`/kun` — bugungi hisobot: bajarilgan ✅ va qolgan ⬜",
  "`/vazifalar` — hammaning bugungi/muddati o'tgan vazifalari",
  "`/bajarilgan` — bugun bajarilgan vazifalar",
  "`/vazifalarim` — o'zingizning ochiq vazifalaringiz",
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

  // --- Task commands ---
  // One person's open tasks (uses the sender's linked account). Checked before
  // the group command: "/vazifalarim" must not be swallowed by "/vazifalar".
  if (/^\/vazifalarim(@\w+)?\b/i.test(text)) {
    const { data: me } = await db
      .from("users")
      .select("id, full_name")
      .eq("telegram_id", fromId ?? "")
      .eq("is_active", true)
      .maybeSingle();
    if (!me) {
      await sendMessage(
        chatId,
        `❓ Hisobingiz ulanmagan. Sizning Telegram ID: \`${fromId ?? "—"}\` — buni administratorga bering.`,
        { replyToMessageId: msg.message_id },
      );
      return;
    }
    const { personalTasksText } = await import("./task-reminders");
    const txt = await personalTasksText(db, me.id, me.full_name ?? "");
    await sendMessage(
      chatId,
      txt ?? `✅ ${me.full_name ?? "Siz"}, ochiq vazifangiz yo'q.`,
      { replyToMessageId: msg.message_id },
    );
    return;
  }
  // Everyone's tasks due today / overdue (for the group).
  if (/^\/(vazifalar|eslatma|bugun)(@\w+)?\b/i.test(text)) {
    const { buildTaskReminders } = await import("./task-reminders");
    const { groupText } = await buildTaskReminders();
    await sendMessage(
      chatId,
      groupText ?? "✅ Hozircha muddati bugun yoki o'tib ketgan ochiq vazifa yo'q.",
      { replyToMessageId: msg.message_id },
    );
    return;
  }
  // Everything the team finished today.
  if (/^\/bajarilgan(@\w+)?\b/i.test(text)) {
    const { buildDoneToday } = await import("./task-reminders");
    const doneText = await buildDoneToday();
    await sendMessage(
      chatId,
      doneText ?? "Bugun hali bajarilgan vazifa yo'q.",
      { replyToMessageId: msg.message_id },
    );
    return;
  }
  // Today's scorecard for everyone — done (✅) + still-open (⬜). Same view the
  // evening cron sends at 20:00.
  if (/^\/kun(@\w+)?\b/i.test(text)) {
    const { buildTodayRecap } = await import("./task-reminders");
    const recapText = await buildTodayRecap();
    await sendMessage(
      chatId,
      recapText ?? "Bugun uchun vazifa yo'q.",
      { replyToMessageId: msg.message_id },
    );
    return;
  }

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

  // --- Deposit (kirim): money IN to an account ---
  if (isDepositTrigger(text)) {
    const { amount, accountAlias } = parseDeposit(text);
    if (amount == null || amount <= 0) {
      await sendMessage(chatId, "❓ Summani topolmadim. Masalan: `kirim 6 mln firma`", {
        replyToMessageId: msg.message_id,
      });
      return;
    }
    if (!accountAlias) {
      await sendMessage(chatId, "❓ Qaysi hisob? Masalan: `kirim 6 mln firma`", {
        replyToMessageId: msg.message_id,
      });
      return;
    }
    const account = await resolveAccountByAlias(db, accountAlias);
    if (!account) {
      await sendMessage(chatId, "❓ Bunday hisob topilmadi.", { replyToMessageId: msg.message_id });
      return;
    }
    const rate = await getCurrentRate(db);
    const createdBy = await resolveCreatedBy(db, fromId);
    const { error } = await db.from("account_transactions").insert({
      account_id: account.id,
      direction: "in",
      kind: "deposit",
      amount,
      currency: account.currency,
      amount_usd: toUsdAt(amount, account.currency, rate.rate),
      rate: rate.rate,
      description: "Telegram kirim",
      occurred_at: new Date().toISOString(),
      created_by: createdBy,
    });
    if (error) {
      await sendMessage(chatId, `⚠️ Xatolik: ${error.message}`, { replyToMessageId: msg.message_id });
      return;
    }
    const bal = await accountBalance(db, account.id);
    await sendMessage(
      chatId,
      [
        `✅ *Kirim* — ${fmtMoney(amount, account.currency)} → 💳 ${account.name}`,
        `Yangi balans: ${fmtMoney(bal, account.currency)}`,
      ].join("\n"),
      { replyToMessageId: msg.message_id },
    );
    return;
  }

  // --- Transfer (o'tkazma): move money between accounts, converting if needed ---
  if (isTransferTrigger(text)) {
    const { amount, fromAlias, toAlias } = parseTransfer(text);
    if (amount == null || amount <= 0) {
      await sendMessage(chatId, "❓ Summani topolmadim. Masalan: `o'tkazma 3 mln firma viza`", {
        replyToMessageId: msg.message_id,
      });
      return;
    }
    if (!fromAlias || !toAlias) {
      await sendMessage(chatId, "❓ Ikkita hisob kerak: `o'tkazma 3 mln firma viza`", {
        replyToMessageId: msg.message_id,
      });
      return;
    }
    const from = await resolveAccountByAlias(db, fromAlias);
    const to = await resolveAccountByAlias(db, toAlias);
    if (!from || !to) {
      await sendMessage(chatId, "❓ Hisob(lar) topilmadi.", { replyToMessageId: msg.message_id });
      return;
    }
    if (from.id === to.id) {
      await sendMessage(chatId, "❓ Bir xil hisob tanlandi.", { replyToMessageId: msg.message_id });
      return;
    }
    const rate = (await getCurrentRate(db)).rate;
    let toAmount = amount;
    if (from.currency !== to.currency) {
      if (from.currency === "UZS" && to.currency === "USD") toAmount = round2(amount / rate);
      else if (from.currency === "USD" && to.currency === "UZS") toAmount = round2(amount * rate);
    }
    const kind = from.currency === to.currency ? "transfer" : "conversion";
    const group = randomUUID();
    const occurred = new Date().toISOString();
    const createdBy = await resolveCreatedBy(db, fromId);
    const { error } = await db.from("account_transactions").insert([
      {
        account_id: from.id,
        direction: "out",
        kind,
        amount,
        currency: from.currency,
        amount_usd: toUsdAt(amount, from.currency, rate),
        rate,
        description: `→ ${to.name}`,
        transfer_group: group,
        occurred_at: occurred,
        created_by: createdBy,
      },
      {
        account_id: to.id,
        direction: "in",
        kind,
        amount: toAmount,
        currency: to.currency,
        amount_usd: toUsdAt(toAmount, to.currency, rate),
        rate,
        description: `← ${from.name}`,
        transfer_group: group,
        occurred_at: occurred,
        created_by: createdBy,
      },
    ]);
    if (error) {
      await sendMessage(chatId, `⚠️ Xatolik: ${error.message}`, { replyToMessageId: msg.message_id });
      return;
    }
    const fromBal = await accountBalance(db, from.id);
    const toBal = await accountBalance(db, to.id);
    const lines = [
      `🔄 *O'tkazma* — ${fmtMoney(amount, from.currency)}`,
      `${from.name} → ${to.name}`,
    ];
    if (kind === "conversion") {
      lines.push(`Konvertatsiya: ${fmtMoney(toAmount, to.currency)} (kurs ${groupThousands(rate)})`);
    }
    lines.push(`${from.name}: ${fmtMoney(fromBal, from.currency)} · ${to.name}: ${fmtMoney(toBal, to.currency)}`);
    await sendMessage(chatId, lines.join("\n"), { replyToMessageId: msg.message_id });
    return;
  }

  // --- Sale (sotuv): create a sale + credit an account ---
  if (isSaleTrigger(text)) {
    const parsed = parseSale(text);
    if (parsed.amount == null || parsed.amount <= 0) {
      await sendMessage(chatId, "❓ Summani topolmadim. Masalan: `sotuv 379$ biznes click firma`", {
        replyToMessageId: msg.message_id,
      });
      return;
    }
    // Resolve product (BAZA/KASB/BIZNES) — optional but preferred.
    let productId: string | null = null;
    let productLabel = "—";
    if (parsed.productName) {
      const { data: product } = await db
        .from("products")
        .select("id, name")
        .eq("name", parsed.productName)
        .maybeSingle();
      if (product) {
        productId = product.id;
        productLabel = product.name;
      }
    }
    // Resolve destination account (named, else default UZS).
    const account = parsed.accountAlias
      ? await resolveAccountByAlias(db, parsed.accountAlias)
      : null;
    const accountId = account?.id ?? (await resolveDefaultAccountId(db, "UZS"));
    if (!accountId) {
      await sendMessage(chatId, "❓ Hisob topilmadi.", { replyToMessageId: msg.message_id });
      return;
    }

    const rate = await getCurrentRate(db);
    const isUsd = parsed.isUsd;
    const totalUsd = isUsd ? round2(parsed.amount) : round2(parsed.amount / rate.rate);
    const totalUzs = isUsd ? Math.round(parsed.amount * rate.rate) : Math.round(parsed.amount);
    const salesPersonId = await resolveCreatedBy(db, fromId);
    const soldAt = new Date().toISOString();

    const { data: sale, error } = await db
      .from("sales")
      .insert({
        product_id: productId,
        account_id: accountId,
        sales_person_id: salesPersonId,
        total_amount_usd: totalUsd,
        total_amount_uzs: totalUzs,
        payment_provider: (parsed.provider as never) ?? null,
        sold_at: soldAt,
      })
      .select("id")
      .single();
    if (error) {
      await sendMessage(chatId, `⚠️ Xatolik: ${error.message}`, { replyToMessageId: msg.message_id });
      return;
    }

    // Credit the account (money in), like sales.create.
    await insertAccountEntry(db, {
      accountId,
      direction: "in",
      kind: "sale",
      amountUsd: totalUsd,
      amountUzs: totalUzs,
      rate: rate.rate,
      description: `Sotuv${productLabel !== "—" ? ` — ${productLabel}` : ""}`,
      relatedType: "sale",
      relatedId: sale.id,
      createdBy: salesPersonId,
      occurredAt: soldAt,
    });

    const { data: acct } = await db
      .from("accounts")
      .select("name, currency")
      .eq("id", accountId)
      .maybeSingle();
    const bal = await accountBalance(db, accountId);
    const shownAmount = isUsd ? formatUsd(parsed.amount) : `${groupThousands(parsed.amount)} so'm`;
    await sendMessage(
      chatId,
      [
        `✅ *Sotuv* — ${shownAmount} — ${productLabel} — 💳 ${acct?.name ?? "—"}`,
        `Yangi balans: ${fmtMoney(bal, acct?.currency ?? "UZS")}`,
      ].join("\n"),
      { replyToMessageId: msg.message_id },
    );
    return;
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
