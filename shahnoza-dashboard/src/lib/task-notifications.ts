import { requireAdminClient } from "@/lib/supabase/admin";

const ON_TIME_MESSAGES = [
  "Afarin [NAME]! Vazifani muddatida tugattingiz. Professionalligi uchun tashakkur. Shuningdek davom eting! 🎯",
  "[NAME], vazifa vaqtida tugalandi. Siz haqiqiy yodulloh bo'ysiz! 💎",
  "Bravo [NAME]! Vaqtni respekt qilasiz. Xalq azizini qadrlaysiz! 👑",
  "Yo [NAME]! Vaqtida tugattingiz?! Siz Transformer bo'lishingiz kerak! Optimus Prime ham sizni tasdiqlay! 🤖⚡",
  "[NAME], vazifani tugatti va vaqt hali bor! Bu robotik aniq! Shuningdek davom etar bo'lsangiz, Mars'ga yuboraman! 🚀",
  "Hayot [NAME], vaqtida tugattingiz! Robotlar ham o'zingizga hayron! Transformer mode: ACTIVATED! ✅🔥",
  "[NAME], siz bilvora yaxshi ishlaysiz! Hatto Megatron ham jalb qiladi! 😂 Bravo! 👏",
];

const LATE_MESSAGES = [
  "[NAME], vazifa muddati o'tdi, lekin tugatdingiz. Keyingi marta tezroq boshlang! ⏱️",
  "Vazifa tugatildi, ammo kech. [NAME], time management o'rganishingiz kerak! 📚",
  "[NAME], siz ko'p ishlaysiz, lekin vaqt bilan birga ishlashni o'rganingiz kerak! ⏰",
  "[NAME], vazifa 3 kun kech tugandi! Siz Yulduz Jangari bo'lgansiz? 😅 Optimus: 'Kech bo'lsa ham, tugattingiz uchun raxmat!' 🤖",
  "Yo [NAME], vaqt Narnia'da to'xtadi! Vazifa kechasidi. Robot bo'lganlar ham kechaladi! ⚡ Keyingi safar vaqtida!",
  "[NAME], dezavtomatizatsiya uchun ishlaysiz? Vazifa vaqti o'tib ketdi! 😂 Lekin tugatdingiz uchun katta rahmat! 🎉",
  "[NAME], siz 'vaqtga qarshi robot'misiz? Vazifa kech bo'ldi ama, lekin shuningdek ajoyib! 💪",
];

const OVERDUE_MESSAGES = [
  "⚠️ DIQQAT [NAME]! Vazifa muddati o'tib ketdi va hali tugalmadi. URGOCH BOSHLANG! 🚨",
  "[NAME], bu vazifa haqida unutdingizmi? Muddati oy bo'ldi! Iloji borida bugun tugatib beringiz! 💔",
  "Vazifa ichkariga tushib qoldi! [NAME], vaqti o'tib ketdi. SHUNINGDEK SHOSHILING! 🔴",
  "[NAME], bu Transformer kutili? Vazifa tarixiga kirdi lekin tugalmadi! 😱 Optimus Prime: 'TUGU QILLL!' 🤖🔥",
  "[NAME], siz sleep mode'dasizmi? Vazifa haqida 2 hafta o'tib ketdi! Cyber Sleeper Mode OFF! 😴⚡",
  "Yo [NAME]! Vazifa ko'ngilda gapalandi! Tez arid bering, aks holda Admin mode'ga o'taman! Admin: ANGRY MODE! 👿🤖",
  "[NAME], siz Matrix'da qulag bo'ldingizmi? Vazifa 1 oy vaqti o'tib ketdi! Red pill ol va TUGU QIL! 💊🔴",
];

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
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

    // Get group ID from settings
    const { data: settings } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .single();

    if (!settings?.value) {
      console.log("task_management_group_id not configured");
      return;
    }

    const groupId = settings.value;

    // Get owner name
    const { data: owner } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .single();

    const ownerName = owner?.full_name || "Owner";

    // Determine if on-time, late, or overdue
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

    // Send to Telegram
    const tgMessage = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName || "unknown"}\n✅ Completed by: @${completedBy.name || "unknown"}\n🔗 Status: ${status}`;

    await notifyTelegram(groupId, tgMessage);

    console.log(`Task notification sent: ${taskId} (${status})`);
  } catch (error) {
    console.error("Task notification error:", error);
  }
}

async function notifyTelegram(chatId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Telegram send error:", error);
    throw error;
  }
}
