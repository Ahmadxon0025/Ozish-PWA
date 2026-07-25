import { requireAdminClient } from "@/lib/supabase/admin";
import { isYandexTtsConfigured } from "@/lib/env";
import { textToSpeech } from "@/lib/yandex-tts";

const ON_TIME_MESSAGES = [
  "[NAME], vazifa muddatida tugalandi. Yaxshi ish, davom eting.",
  "Afarin [NAME]! Muddatni respekt qilasiz. Shuningdek to'ldirishni davom eting.",
  "[NAME], vaqtida tugattingiz. Professionalligi uchun tashakkur.",
  "[NAME], bu vazifa muddatida tugatildi. Shuningdek ishlashingizni va'da berish qiladi.",
  "Juda yaxshi [NAME]. Vaqtni boshqarish aniq ishlayapti.",
  "[NAME], bu sifatli ish. Muddatga nisbatan ehtiyot qilishingiz menga yoqadi.",
  "Tugallandi, muddatida. [NAME], davom eting.",
];

const LATE_MESSAGES = [
  "[NAME], vazifa tugalandi, lekin muddati o'tib ketdi. Keyingi marta boshlab qo'ying, shaxsiy vaqt boshqaruv muhim.",
  "Vazifa tugatildi, ammo geruqtada. [NAME], vaqt jadvali boshqaruvi kerak bo'lib ko'rinadi.",
  "[NAME], muddatdan so'ng tugattingiz. Tugattingiz uchun rahmat, lekin vaqtni oldindan rejalashtirishni tavsiya qilaman.",
  "[NAME], bu vazifa qisman kech tugatildi. Keyingi loyallik uchun muddatdan birini ert boshlash yaxshi bo'lardi.",
  "Vazifa kech tugalandi, [NAME]. Hali ham tugagani uchun shuning uchun tashakkur, lekin vaqt boshqaruvi muhim.",
  "[NAME], kechikish bo'ldi. Tugagani uchun tashakkur, lekin muddatni nazar ostida tutish kerak.",
  "[NAME], bu muddatan keyinroq tugatildi. Kechikishni minimallashtirish uchun boshlab qo'yish muhim.",
];

const OVERDUE_MESSAGES = [
  "DIQQAT [NAME]! Bu vazifa muddati o'tib ketdi va hali tugalmadi. Shoshib tugating.",
  "[NAME], bu vazifa haqida nutq yo'qligi ko'rinadi. Muddati yanada o'tib ketdi. Iloji borida bugun tugatib beringiz.",
  "[NAME], bu vazifa hali taqhilda? Vaqti o'tib ketdi. Bujon ushbu kuni tugating.",
  "[NAME], bu vazifa o'tib ketdi va tugalmadi. Shoshib boshlang, iltimos.",
  "[NAME], bu muddati katta o'tib ketdi. Ushbu vazifani talab qilaman. Shoshib tugating.",
  "[NAME], bu vazifa hali kutilmoqda. Vaqti kattadan o'tib ketdi. Iloji borida tezroq tugating.",
  "[NAME], bu vazifa muddati yanada o'tib ketdi. Ushbu muddani ahamiyat berish kerak.",
];

const MISSED_DEADLINE_MESSAGES = [
  "[NAME], muddat [OLD_DATE] dan [NEW_DATE] ga o'zgartirildi. Yangi muddatga nisbatan ehtiyot qiling.",
  "[NAME], muddatni tezda o'zgartirdingiz. Yangi muddat [NEW_DATE]. Tezroq boshlash kerak.",
  "Muddat o'zgarishi: [OLD_DATE] dan [NEW_DATE] ga. [NAME], yangi jadvalni qabul qiling.",
  "[NAME], muddati tez o'zgarib ketdi. Eski muddat [OLD_DATE], yangi muddat [NEW_DATE].",
  "Diqqat [NAME]! Muddat [NEW_DATE] ga o'zgartirildi. Vaqtni yanada ehtiyot qiling.",
  "[NAME], muddat qayta belgilanildi: [NEW_DATE]. Yangi jadvalni boshlab qo'ying.",
  "[NAME], eski muddat [OLD_DATE] bu o'tib ketdi, lekin yangi muddat [NEW_DATE] ga o'zgartirildi.",
  "Muddat o'zgariganini bilmoyapsiz, [NAME]. Yangi muddat [NEW_DATE].",
];

const DEADLINE_EXTENDED_MESSAGES = [
  "[NAME], muddat [OLD_DATE] dan [NEW_DATE] ga uzaytrildi. [DAYS_EXTENDED] kun qo'shimcha vaqtingiz bor.",
  "[NAME], mudda uzaytirildi. [DAYS_EXTENDED] kun yanada vaqtingiz bor. [NEW_DATE] ga tayyorlanish uchun.",
  "Yaxshi yangilik [NAME]! Muddat [DAYS_EXTENDED] kun uzaytirildi. Endi [NEW_DATE] ga mohlat bor.",
  "[NAME], muddatni [DAYS_EXTENDED] kun o'zartdik. Yangi muddat [NEW_DATE].",
  "[NAME], vaqt qo'shimchasi berildi. [OLD_DATE] dan [NEW_DATE] ga uzaytirildi.",
  "[NAME], [DAYS_EXTENDED] kun qo'shimcha vaqt olding. Yangi muddat [NEW_DATE].",
  "Muromaza, [NAME]! Muddat [DAYS_EXTENDED] kun uzaytirildi. [NEW_DATE] gacha vaqt bor.",
  "[NAME], muddati uzaytirildi [DAYS_EXTENDED] kunka. Yangi jadvalni tayyorlanish uchun foydalaning.",
];

const DEADLINE_SHORTENED_MESSAGES = [
  "DIQQAT [NAME]! Muddat [DAYS_SHORTENED] kunka qisqartirildi. Yangi muddat [NEW_DATE].",
  "[NAME], muddat o'zgarishi: [OLD_DATE] dan [NEW_DATE] ga. Vaqt tezroq tugaydi.",
  "[NAME], muddatni tez qisqartirdik. [DAYS_SHORTENED] kun qoldi. Yangi muddat [NEW_DATE].",
  "Shoshish vaqti [NAME]! Muddat [DAYS_SHORTENED] kunka qisqartirildi. [NEW_DATE] ga tayyorlanish kerak.",
  "[NAME], vaqt yanada qisqardi. [OLD_DATE] dan [NEW_DATE] ga o'zgartirildi.",
  "[NAME], [DAYS_SHORTENED] kun vaqt yo'q bo'lib qoldi. Yangi muddat [NEW_DATE].",
  "Endi tezroq ishlashing kerak, [NAME]! Muddat [DAYS_SHORTENED] kunka qisqartirildi.",
  "[NAME], vaqt kompressiyasi! [DAYS_SHORTENED] kun qoldi muddatga. [NEW_DATE] ga mohlat.",
];

const FINISHED_VERY_LATE_MESSAGES = [
  "[NAME], nihoyat tugattingiz! [DAYS_LATE] kundan keyin, lekin tugalandi.",
  "Tugallandi, [NAME]! [DAYS_LATE] kun kechikish bilan, ammo tugattingiz.",
  "[NAME], bu vazifa [DAYS_LATE] kun kech tugalandi, lekin shuningdek tugattingiz uchun tashakkur.",
  "[NAME], [DAYS_LATE] kun kechikish bilan tugattingiz. Hali ham tugagani uchun qo'ng'iroq berish kerak.",
  "Tugallandi, [NAME]. [DAYS_LATE] kun kechiga, lekin oxirida tugattingiz.",
  "[NAME], bu [DAYS_LATE] kunlik kechikish bilan tugalandi. Vaqt boshqaruvini yaxshilash kerak.",
  "Avtsoori tugallandi [NAME]! [DAYS_LATE] kundan keyin, lekin tugattingiz.",
  "[NAME], bu vazifa [DAYS_LATE] kun kech tugatildi. Kechikshini minimallashtirish kerak.",
];

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric" });
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs(Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function notifyDeadlineMissed(
  taskId: string,
  taskTitle: string,
  updatedBy: { id: string; name: string | null },
  ownerId: string | null,
  oldDueDate: string | null,
  newDueDate: string | null
) {
  if (!ownerId || !oldDueDate || !newDueDate) return;

  try {
    const client = requireAdminClient();
    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .maybeSingle();

    if (settingsError || !settings?.value) return;

    const { data: owner } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .maybeSingle();

    const ownerName = owner?.full_name || "Owner";
    const template = getRandomMessage(MISSED_DEADLINE_MESSAGES);
    const message = template
      .replace("[NAME]", updatedBy.name || "Friend")
      .replace("[OLD_DATE]", formatDate(oldDueDate))
      .replace("[NEW_DATE]", formatDate(newDueDate));

    const caption = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n⚠️ Reason: Deadline moved earlier after passing`;

    // Try voice message if TTS is configured
    if (isYandexTtsConfigured()) {
      try {
        const audio = await textToSpeech(message);
        await notifyTelegramVoice(settings.value, audio, caption);
      } catch (ttsError) {
        console.error("❌ TTS failed, falling back to text:", ttsError);
        await notifyTelegram(settings.value, caption);
      }
    } else {
      await notifyTelegram(settings.value, caption);
    }
  } catch (error) {
    console.error("❌ Missed deadline notification error:", error);
  }
}

export async function notifyDeadlineExtended(
  taskId: string,
  taskTitle: string,
  updatedBy: { id: string; name: string | null },
  ownerId: string | null,
  oldDueDate: string | null,
  newDueDate: string | null
) {
  if (!ownerId || !oldDueDate || !newDueDate) return;

  try {
    const client = requireAdminClient();
    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .maybeSingle();

    if (settingsError || !settings?.value) return;

    const { data: owner } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .maybeSingle();

    const ownerName = owner?.full_name || "Owner";
    const daysExtended = daysBetween(oldDueDate, newDueDate);
    const template = getRandomMessage(DEADLINE_EXTENDED_MESSAGES);
    const message = template
      .replace("[NAME]", updatedBy.name || "Friend")
      .replace("[OLD_DATE]", formatDate(oldDueDate))
      .replace("[NEW_DATE]", formatDate(newDueDate))
      .replace("[DAYS_EXTENDED]", daysExtended.toString());

    const caption = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n✨ Extra time: +${daysExtended} days`;

    if (isYandexTtsConfigured()) {
      try {
        const audio = await textToSpeech(message);
        await notifyTelegramVoice(settings.value, audio, caption);
      } catch (ttsError) {
        console.error("❌ TTS failed, falling back to text:", ttsError);
        await notifyTelegram(settings.value, caption);
      }
    } else {
      await notifyTelegram(settings.value, caption);
    }
  } catch (error) {
    console.error("❌ Deadline extended notification error:", error);
  }
}

export async function notifyDeadlineShortened(
  taskId: string,
  taskTitle: string,
  updatedBy: { id: string; name: string | null },
  ownerId: string | null,
  oldDueDate: string | null,
  newDueDate: string | null
) {
  if (!ownerId || !oldDueDate || !newDueDate) return;

  try {
    const client = requireAdminClient();
    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .maybeSingle();

    if (settingsError || !settings?.value) return;

    const { data: owner } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .maybeSingle();

    const ownerName = owner?.full_name || "Owner";
    const daysShortenend = daysBetween(newDueDate, oldDueDate);
    const template = getRandomMessage(DEADLINE_SHORTENED_MESSAGES);
    const message = template
      .replace("[NAME]", updatedBy.name || "Friend")
      .replace("[OLD_DATE]", formatDate(oldDueDate))
      .replace("[NEW_DATE]", formatDate(newDueDate))
      .replace("[DAYS_SHORTENED]", daysShortenend.toString());

    const caption = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n⏱️ Deadline moved: -${daysShortenend} days`;

    if (isYandexTtsConfigured()) {
      try {
        const audio = await textToSpeech(message);
        await notifyTelegramVoice(settings.value, audio, caption);
      } catch (ttsError) {
        console.error("❌ TTS failed, falling back to text:", ttsError);
        await notifyTelegram(settings.value, caption);
      }
    } else {
      await notifyTelegram(settings.value, caption);
    }
  } catch (error) {
    console.error("❌ Deadline shortened notification error:", error);
  }
}

export async function notifyFinishedVeryLate(
  taskId: string,
  taskTitle: string,
  completedBy: { id: string; name: string | null },
  ownerId: string | null,
  dueDate: string | null,
  completedAt: string
) {
  if (!ownerId || !dueDate) return;

  try {
    const client = requireAdminClient();
    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .maybeSingle();

    if (settingsError || !settings?.value) return;

    const { data: owner } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .maybeSingle();

    const ownerName = owner?.full_name || "Owner";
    const daysLate = daysBetween(dueDate, completedAt);

    // Only notify if 5+ days late
    if (daysLate < 5) return;

    const template = getRandomMessage(FINISHED_VERY_LATE_MESSAGES);
    const message = template
      .replace("[NAME]", completedBy.name || "Friend")
      .replace("[DAYS_LATE]", daysLate.toString());

    const caption = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n✅ Completed by: @${completedBy.name || "unknown"}\n⏳ Days late: ${daysLate}`;

    if (isYandexTtsConfigured()) {
      try {
        const audio = await textToSpeech(message);
        await notifyTelegramVoice(settings.value, audio, caption);
      } catch (ttsError) {
        console.error("❌ TTS failed, falling back to text:", ttsError);
        await notifyTelegram(settings.value, caption);
      }
    } else {
      await notifyTelegram(settings.value, caption);
    }
  } catch (error) {
    console.error("❌ Finished very late notification error:", error);
  }
}

export async function notifyTaskCompletion(
  taskId: string,
  taskTitle: string,
  completedBy: { id: string; name: string | null },
  ownerId: string | null,
  dueDate: string | null,
  completedAt: string
) {
  if (!ownerId) return;

  try {
    const client = requireAdminClient();

    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .maybeSingle();

    if (settingsError || !settings?.value) return;

    const groupId = settings.value;

    const { data: owner } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .maybeSingle();

    const ownerName = owner?.full_name || "Owner";

    let messageList = LATE_MESSAGES;
    let status = "late";

    if (dueDate) {
      const due = new Date(dueDate);
      const completed = new Date(completedAt);

      if (completed <= due) {
        messageList = ON_TIME_MESSAGES;
        status = "on-time";
      }
    }

    const template = getRandomMessage(messageList);
    const message = template.replace("[NAME]", completedBy.name || "Friend");

    const caption = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName || "unknown"}\n✅ Completed by: @${completedBy.name || "unknown"}\n🔗 Status: ${status}`;

    console.log("🎙️ TTS Config check:", { isConfigured: isYandexTtsConfigured() });

    if (isYandexTtsConfigured()) {
      try {
        console.log("🎙️ Generating voice message...");
        const audio = await textToSpeech(message);
        console.log("🎙️ Voice generated, sending to Telegram...");
        await notifyTelegramVoice(groupId, audio, caption);
        console.log("✅ Voice message sent!");
      } catch (ttsError) {
        console.error("❌ TTS failed, falling back to text:", ttsError);
        await notifyTelegram(groupId, caption);
      }
    } else {
      console.log("⚠️ TTS not configured, sending text message");
      await notifyTelegram(groupId, caption);
    }
  } catch (error) {
    console.error("❌ Task notification error:", error);
  }
}

async function notifyTelegram(chatId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
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

async function notifyTelegramVoice(chatId: string, audioBuffer: Buffer, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const url = `https://api.telegram.org/bot${token}/sendVoice`;

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("voice", new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" }), "voice.ogg");
  formData.append("caption", caption);
  formData.append("parse_mode", "HTML");

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram Voice API error: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}
