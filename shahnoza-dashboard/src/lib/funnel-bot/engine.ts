import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { ingestFunnelEvent } from "@/lib/marketing/ingest";
import { sendMessage as sendViaMainBot } from "@/lib/telegram/bot";
import { env } from "@/lib/env";
import { FLOW_KEY, ENTRY_STEP, getStep, type FlowStep } from "./flow";
import { sendRich, personalize, answerCallback, InlineKeyboard, Keyboard } from "./telegram";
import { ovText, ovMinutes, setFlowOv, loadFlowOv } from "./overrides";

// The bot's own tables aren't in the generated Database types, so we use a
// loosely-typed admin client for them (same approach as the finance bot).
type Db = ReturnType<typeof requireAdminClient>;
type Loose = any;

interface Subscriber {
  id: string;
  telegram_id: string;
  chat_id: string;
  first_name: string | null;
  username: string | null;
  phone: string | null;
  segment: string | null;
  city: string | null;
  status: string;
}
interface Run {
  id: string;
  subscriber_id: string;
  flow_key: string;
  current_step: string | null;
  status: string;
}

const CONTINUE_LABEL = "Davom etish →";

async function log(db: Loose, subId: string | null, stepId: string | null, direction: string, kind: string, detail?: string) {
  try {
    await db.from("funnel_bot_log").insert({ subscriber_id: subId, step_id: stepId, direction, kind, detail: detail ?? null });
  } catch {
    /* logging must never break the flow */
  }
}

async function upsertSubscriber(db: Loose, from: Loose, chatId: string | number): Promise<Subscriber | null> {
  const telegram_id = String(from.id);
  const patch = {
    telegram_id,
    chat_id: String(chatId),
    first_name: from.first_name ?? null,
    username: from.username ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data } = await db
    .from("funnel_bot_subscribers")
    .upsert(patch, { onConflict: "telegram_id" })
    .select()
    .single();
  return (data as Subscriber) ?? null;
}

async function getSubscriberByTgId(db: Loose, tgId: string | number): Promise<Subscriber | null> {
  const { data } = await db.from("funnel_bot_subscribers").select("*").eq("telegram_id", String(tgId)).maybeSingle();
  return (data as Subscriber) ?? null;
}

async function updateSubscriber(db: Loose, id: string, patch: Record<string, unknown>) {
  await db.from("funnel_bot_subscribers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

async function getActiveRun(db: Loose, subscriberId: string): Promise<Run | null> {
  const { data } = await db
    .from("funnel_bot_runs")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .in("status", ["running", "waiting", "delayed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Run) ?? null;
}

async function setRunState(db: Loose, runId: string, current_step: string | null, status: string) {
  await db.from("funnel_bot_runs").update({ current_step, status, updated_at: new Date().toISOString() }).eq("id", runId);
}

// ─────────────────────────────── keyboards ───────────────────────────────

function buildInline(step: FlowStep): InlineKeyboard | undefined {
  if (step.type === "continue") {
    return new InlineKeyboard().text(step.label ?? CONTINUE_LABEL, `b:${step.id}:0`);
  }
  if (step.type === "buttons") {
    const kb = new InlineKeyboard();
    step.buttons.forEach((btn, i) => {
      if (btn.url) kb.url(btn.text, btn.url).row();
      else kb.text(btn.text, `b:${step.id}:${i}`).row();
    });
    return kb;
  }
  if (step.type === "message" && step.urlButtons?.length) {
    const kb = new InlineKeyboard();
    let any = false;
    for (const b of step.urlButtons) {
      if (b.url) {
        kb.url(b.text, b.url).row();
        any = true;
      }
    }
    return any ? kb : undefined;
  }
  return undefined;
}

// ─────────────────────────────── execution ───────────────────────────────

/** Walk the flow from `stepId`, sending steps until we hit a wait/delay/end. */
async function runFrom(db: Loose, sub: Subscriber, run: Run, stepId: string | null) {
  let cur = stepId;
  for (let guard = 0; guard < 60 && cur; guard++) {
    const step = getStep(cur);
    if (!step) {
      await setRunState(db, run.id, null, "done");
      return;
    }
    const chatId = sub.chat_id;

    switch (step.type) {
      case "message": {
        await sendRich(chatId, personalize(ovText(step.id, step.text), sub.first_name), { media: step.media, replyMarkup: buildInline(step) });
        await log(db, sub.id, step.id, "out", "message");
        cur = step.next;
        break;
      }
      case "continue":
      case "buttons": {
        await sendRich(chatId, personalize(ovText(step.id, step.text), sub.first_name), { media: step.media, replyMarkup: buildInline(step) });
        await log(db, sub.id, step.id, "out", step.type);
        await setRunState(db, run.id, step.id, "waiting");
        return;
      }
      case "ask_phone": {
        const kb = new Keyboard().requestContact(step.buttonText);
        await sendRich(chatId, personalize(ovText(step.id, step.text), sub.first_name), { replyMarkup: kb });
        await log(db, sub.id, step.id, "out", "ask_phone");
        await setRunState(db, run.id, step.id, "waiting");
        return;
      }
      case "ask_text": {
        await sendRich(chatId, personalize(ovText(step.id, step.text), sub.first_name), { replyMarkup: { remove_keyboard: true } });
        await log(db, sub.id, step.id, "out", "ask_text");
        await setRunState(db, run.id, step.id, "waiting");
        return;
      }
      case "delay": {
        const runAt = new Date(Date.now() + ovMinutes(step.id, step.minutes) * 60_000).toISOString();
        await db.from("funnel_bot_schedule").insert({ run_id: run.id, step_id: step.next, run_at: runAt, status: "pending" });
        await log(db, sub.id, step.id, "out", "delay", `+${step.minutes}m → ${step.next}`);
        await setRunState(db, run.id, step.id, "delayed");
        return;
      }
      case "action": {
        await doAction(db, sub, step.action);
        cur = step.next ?? null;
        break;
      }
      case "end": {
        if (step.text) {
          await sendRich(chatId, personalize(ovText(step.id, step.text), sub.first_name), { replyMarkup: { remove_keyboard: true } });
          await log(db, sub.id, step.id, "out", "message");
        }
        if (step.status) await updateSubscriber(db, sub.id, { status: step.status });
        await setRunState(db, run.id, step.id, "done");
        return;
      }
    }
    if (!cur) {
      await setRunState(db, run.id, step.id, "done");
      return;
    }
  }
}

async function doAction(db: Loose, sub: Subscriber, action: string) {
  switch (action) {
    case "mark_lead":
      await updateSubscriber(db, sub.id, { status: "lead" });
      break;
    case "mark_call_requested":
      await updateSubscriber(db, sub.id, { status: "call_requested" });
      try {
        await ingestFunnelEvent(db, { event: "call_booked", telegramId: sub.telegram_id });
      } catch {
        /* funnel event best-effort */
      }
      break;
    case "mark_cold":
      await updateSubscriber(db, sub.id, { status: "cold" });
      break;
    case "notify_sales":
      await notifySales(`📞 Yangi qo'ng'iroq so'rovi (funnel bot)\n👤 ${sub.first_name ?? "—"}${sub.username ? " (@" + sub.username + ")" : ""}\n📱 ${sub.phone ?? "raqam yo'q"}\n🏙 ${sub.city ?? "—"} · segment: ${sub.segment ?? "—"}`);
      break;
  }
}

async function notifySales(text: string) {
  const chat = env.TELEGRAM_SALES_GROUP_ID || env.TELEGRAM_ADMIN_CHAT_ID || env.TELEGRAM_OWNER_CHAT_ID;
  if (chat) await sendViaMainBot(chat, text);
}

// ─────────────────────────── inbound resume points ───────────────────────

async function startFlow(db: Loose, sub: Subscriber) {
  // Debounce: queued /start floods (e.g. a webhook outage backlog flushing)
  // must not send N welcomes. One fresh run per minute per subscriber.
  const { data: recent } = await db
    .from("funnel_bot_runs")
    .select("created_at")
    .eq("subscriber_id", sub.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.created_at && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
    return;
  }
  // one active run per subscriber — retire any previous one
  await db.from("funnel_bot_runs").update({ status: "stopped" }).eq("subscriber_id", sub.id).in("status", ["running", "waiting", "delayed"]);
  const { data } = await db
    .from("funnel_bot_runs")
    .insert({ subscriber_id: sub.id, flow_key: FLOW_KEY, current_step: ENTRY_STEP, status: "running" })
    .select()
    .single();
  const run = data as Run;
  if (run) await runFrom(db, sub, run, ENTRY_STEP);
}

async function onButtonTap(db: Loose, sub: Subscriber, run: Run, stepId: string, idx: number) {
  if (run.current_step !== stepId) return; // stale tap (already moved on)
  const step = getStep(stepId);
  if (!step) return;
  let next: string | undefined;
  if (step.type === "continue") {
    next = step.next;
  } else if (step.type === "buttons") {
    const btn = step.buttons[idx];
    if (!btn) return;
    if (btn.segment) await updateSubscriber(db, sub.id, { segment: btn.segment });
    next = btn.next;
  }
  await log(db, sub.id, stepId, "in", "button", String(idx));
  if (next) await runFrom(db, { ...sub }, run, next);
}

async function onPhone(db: Loose, sub: Subscriber, run: Run | null, phone: string) {
  await updateSubscriber(db, sub.id, { phone, status: "lead" });
  await log(db, sub.id, run?.current_step ?? null, "in", "phone");
  try {
    await ingestFunnelEvent(db, { event: "phone_captured", telegramId: sub.telegram_id, phone, fullName: sub.first_name ?? null });
  } catch {
    /* best-effort */
  }
  const step = run ? getStep(run.current_step ?? "") : undefined;
  if (run && step?.type === "ask_phone") {
    await runFrom(db, { ...sub, phone }, run, step.next);
  }
}

async function onText(db: Loose, sub: Subscriber, run: Run | null, text: string) {
  const step = run ? getStep(run.current_step ?? "") : undefined;
  if (run && step?.type === "ask_text") {
    await updateSubscriber(db, sub.id, { [step.field]: text });
    await log(db, sub.id, step.id, "in", "reply", step.field);
    await runFrom(db, { ...sub, city: text }, run, step.next);
    return;
  }
  // "any reply stops the drip" → hand to a human (speed-to-lead)
  if (run) {
    await db.from("funnel_bot_runs").update({ status: "stopped" }).eq("id", run.id);
    await updateSubscriber(db, sub.id, { status: "replied" });
    await log(db, sub.id, run.current_step, "in", "reply", text.slice(0, 200));
    await notifySales(`💬 Funnel bot: yangi javob (drip to'xtadi)\n👤 ${sub.first_name ?? "—"}${sub.username ? " (@" + sub.username + ")" : ""}\n📱 ${sub.phone ?? "—"}\n📝 ${text.slice(0, 300)}`);
  }
}

// ─────────────────────────────── dispatcher ──────────────────────────────

/** Handle one Telegram update. Never throws (webhook must always 200). */
export async function handleUpdate(update: Loose): Promise<void> {
  const db = requireAdminClient() as Loose;
  setFlowOv(await loadFlowOv(db)); // latest dashboard edits (text/timing/media)
  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      await answerCallback(cq.id);
      const sub = await getSubscriberByTgId(db, cq.from.id);
      if (!sub) return;
      const run = await getActiveRun(db, sub.id);
      if (!run) return;
      const parts = String(cq.data ?? "").split(":"); // b:stepId:idx
      if (parts[0] === "b" && parts[1]) await onButtonTap(db, sub, run, parts[1], Number(parts[2] ?? 0));
      return;
    }

    const msg = update.message ?? update.edited_message;
    if (!msg || !msg.from) return;
    const chatId = msg.chat?.id ?? msg.from.id;

    // contact share (phone capture)
    if (msg.contact?.phone_number) {
      const sub = (await getSubscriberByTgId(db, msg.from.id)) ?? (await upsertSubscriber(db, msg.from, chatId));
      if (!sub) return;
      const run = await getActiveRun(db, sub.id);
      await onPhone(db, sub, run, msg.contact.phone_number);
      return;
    }

    const text = String(msg.text ?? "").trim();
    if (!text) return;

    // /start [payload]
    if (/^\/start(\s|$)/i.test(text)) {
      const payload = text.replace(/^\/start\s*/i, "").trim() || null;
      const sub = await upsertSubscriber(db, msg.from, chatId);
      if (!sub) return;
      try {
        await ingestFunnelEvent(db, {
          event: "bot_start",
          telegramId: sub.telegram_id,
          telegramUsername: sub.username,
          fullName: sub.first_name ?? null,
          payload,
        });
      } catch {
        /* best-effort attribution */
      }
      await startFlow(db, sub);
      return;
    }

    // any other text → capture (city) or human takeover
    const sub = await getSubscriberByTgId(db, msg.from.id);
    if (!sub) return;
    const run = await getActiveRun(db, sub.id);
    await onText(db, sub, run, text);
  } catch (err) {
    console.error("funnel bot handleUpdate error:", err);
  }
}

// ─────────────────────────────── cron tick ───────────────────────────────

/** Resume every delay whose time has come. Called by the cron route. */
export async function processDueSteps(limit = 100): Promise<number> {
  const db = requireAdminClient() as Loose;
  setFlowOv(await loadFlowOv(db)); // latest dashboard edits (text/timing/media)
  const nowIso = new Date().toISOString();
  const { data: due } = await db
    .from("funnel_bot_schedule")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);
  const rows = (due as Array<{ id: string; run_id: string; step_id: string }>) ?? [];
  let done = 0;
  for (const row of rows) {
    // claim it (avoid double-fire if two ticks overlap)
    const { data: claimed } = await db
      .from("funnel_bot_schedule")
      .update({ status: "done" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: runData } = await db.from("funnel_bot_runs").select("*").eq("id", row.run_id).maybeSingle();
    const run = runData as Run | null;
    if (!run || run.status === "stopped" || run.status === "done") continue;
    const { data: subData } = await db.from("funnel_bot_subscribers").select("*").eq("id", run.subscriber_id).maybeSingle();
    const sub = subData as Subscriber | null;
    if (!sub) continue;
    try {
      await runFrom(db, sub, run, row.step_id);
      done++;
    } catch (err) {
      console.error("funnel bot resume error:", err);
    }
  }
  return done;
}

export const _internal = { runFrom, startFlow };
export type { Subscriber, Run, Db };
