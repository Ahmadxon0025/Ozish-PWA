import { requireAdminClient } from "@/lib/supabase/admin";
import { isYandexTtsConfigured } from "@/lib/env";
import { textToSpeech } from "@/lib/yandex-tts";

const ON_TIME_MESSAGES = [
  "[NAME], vazifani muddatida bajardingiz, molodes",
  "[NAME], vazifani vaqtida tugatdingiz, afarin",
  "Yaxshi [NAME], muddatni respekt qilasiz",
  "[NAME], vazifa muddatida tugalandi",
  "Afarin [NAME], shuningdek davom eting",
  "[NAME], vaqtida tugattingiz, tashakkur",
  "[NAME], vazifani muddatida bajaradingiz",
];

const LATE_MESSAGES = [
  "[NAME], vazifa tugalandi, lekin muddati o'tib ketdi",
  "[NAME], vazifani kech bajardiingiz. Keyingi marta tezroq boshlang",
  "Vazifa tugatildi, ammo muddati o'tib ketdi",
  "[NAME], kech tugalandi, lekin tugagani uchun tashakkur",
  "[NAME], muddatdan so'ng tugattingiz",
  "Vazifa kech tugatildi",
  "[NAME], vaqtni boshqarish kerak bo'lib ko'rinadi",
];

const OVERDUE_MESSAGES = [
  "[NAME], bu vazifa muddati o'tib ketdi. Shoshib tugating",
  "[NAME], vazifa hali kutilmoqda. Bujon tezroq bajarish kerak",
  "Vazifa muddati o'tib ketdi, [NAME]. Iloji borida bugun tugating",
  "[NAME], bu vazifa tugalmadi. Vaqti o'tib ketdi",
  "[NAME], muddati katta o'tib ketdi. Tezroq boshlang",
  "Bu vazifa o'tib ketdi, [NAME]. Shoshib bajarish kerak",
  "[NAME], vazifa kutilmoqda. Tugating, iltimos",
];

const MISSED_DEADLINE_MESSAGES = [
  "[NAME], muddat [NEW_DATE] ga o'zgartirildi",
  "Muddat [OLD_DATE] dan [NEW_DATE] ga ko'chirildi",
  "[NAME], yangi muddat [NEW_DATE]",
  "[NAME], muddati o'zgarishi: [NEW_DATE]",
  "Diqqat [NAME]! Muddat [NEW_DATE] ga ko'chirildi",
  "[NAME], yangi muddat: [NEW_DATE]",
  "Muddat o'zgartirildi: [NEW_DATE]",
  "[NAME], yangi jadvalni tayyorlanish: [NEW_DATE]",
];

const DEADLINE_EXTENDED_MESSAGES = [
  "[NAME], muddat [DAYS_EXTENDED] kun uzaytirildi. Yangi muddat: [NEW_DATE]",
  "[NAME], [DAYS_EXTENDED] kun qo'shimcha vaqt olding",
  "Muddat uzaytirildi: [NEW_DATE]",
  "[NAME], yangi muddat [NEW_DATE]",
  "[NAME], [DAYS_EXTENDED] kun ko'paytdi",
  "Muddat [DAYS_EXTENDED] kunka uzaytirildi",
  "[NAME], vaqt qo'shimchasi berildi: [NEW_DATE]",
  "Yangi muddat: [NEW_DATE]",
];

const DEADLINE_SHORTENED_MESSAGES = [
  "[NAME], muddat [DAYS_SHORTENED] kunka qisqartirildi. Yangi muddat: [NEW_DATE]",
  "[NAME], muddat o'zgarishi: [NEW_DATE]",
  "[NAME], vaqt qisqardi. [DAYS_SHORTENED] kun qoldi",
  "Diqqat [NAME]! Muddat [NEW_DATE] ga ko'chirildi",
  "[NAME], yangi muddat: [NEW_DATE]",
  "Muddat tezroq tugaydi: [NEW_DATE]",
  "[NAME], [DAYS_SHORTENED] kun qoldi",
  "[NAME], vaqt yanada qisqardi",
];

const FINISHED_VERY_LATE_MESSAGES = [
  "[NAME], nihoyat tugattingiz. [DAYS_LATE] kundan keyin",
  "[NAME], [DAYS_LATE] kun kech tugalandi",
  "Tugallandi, lekin [DAYS_LATE] kunni uchun",
  "[NAME], [DAYS_LATE] kunlik kechikish",
  "[NAME], oxirida tugattingiz. [DAYS_LATE] kun kech",
  "Vazifa tugatildi: [DAYS_LATE] kundan keyin",
  "[NAME], [DAYS_LATE] kundan keyin tugattingiz",
  "Tugallandi, [DAYS_LATE] kunlik kechikish bilan",
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

    const template = getRandomMessage(MISSED_DEADLINE_MESSAGES);
    const message = template
      .replace("[NAME]", `@${updatedBy.name || "Friend"}`)
      .replace("[OLD_DATE]", formatDate(oldDueDate))
      .replace("[NEW_DATE]", formatDate(newDueDate));

    const caption = `${message}\n\n📌 Vazifa: ${taskTitle}`;

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
      .replace("[NAME]", `@${updatedBy.name || "Friend"}`)
      .replace("[OLD_DATE]", formatDate(oldDueDate))
      .replace("[NEW_DATE]", formatDate(newDueDate))
      .replace("[DAYS_EXTENDED]", daysExtended.toString());

    const caption = `${message}\n\n📌 Vazifa: ${taskTitle}`;

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

    const daysShortenend = daysBetween(newDueDate, oldDueDate);
    const template = getRandomMessage(DEADLINE_SHORTENED_MESSAGES);
    const message = template
      .replace("[NAME]", `@${updatedBy.name || "Friend"}`)
      .replace("[OLD_DATE]", formatDate(oldDueDate))
      .replace("[NEW_DATE]", formatDate(newDueDate))
      .replace("[DAYS_SHORTENED]", daysShortenend.toString());

    const caption = `${message}\n\n📌 Vazifa: ${taskTitle}`;

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
      .replace("[NAME]", `@${completedBy.name || "Friend"}`)
      .replace("[DAYS_LATE]", daysLate.toString());

    const caption = `${message}\n\n📌 Vazifa: ${taskTitle}`;

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
    const message = template.replace("[NAME]", `@${completedBy.name || "Friend"}`);

    const caption = `${message}\n\n📌 Vazifa: ${taskTitle}`;

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
