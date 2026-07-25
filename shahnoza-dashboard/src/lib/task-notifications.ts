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
  console.log("🔔 notifyTaskCompletion called", { taskId, taskTitle, ownerId, dueDate });
  if (!ownerId) {
    console.log("⚠️  No owner ID, skipping notification");
    return;
  }
  try {
    console.log("📋 Getting admin client...");
    const client = requireAdminClient();
    console.log("✅ Admin client ready");

    // Get group ID from settings
    console.log("📋 Querying app_settings for task_management_group_id...");
    const { data: settings, error: settingsError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .maybeSingle();

    if (settingsError) {
      console.error("❌ Error fetching app_settings:", settingsError);
      return;
    }

    if (!settings?.value) {
      console.log("❌ task_management_group_id is empty or not configured. Value:", settings?.value);
      return;
    }

    const groupId = settings.value;
    console.log("✅ Found group ID:", groupId);

    // Get owner name
    console.log("📋 Querying users for owner:", ownerId);
    const { data: owner, error: ownerError } = await client
      .from("users")
      .select("full_name")
      .eq("id", ownerId)
      .maybeSingle();

    if (ownerError) {
      console.error("❌ Error fetching owner:", ownerError);
    }

    const ownerName = owner?.full_name || "Owner";
    console.log("✅ Owner name:", ownerName);

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

    console.log("📋 Status:", status);
    const template = getRandomMessage(messageList);
    const message = template.replace("[NAME]", completedBy.name || "Friend");

    // Send to Telegram
    const tgMessage = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName || "unknown"}\n✅ Completed by: @${completedBy.name || "unknown"}\n🔗 Status: ${status}`;

    console.log("📤 About to send Telegram message...");
    await notifyTelegram(groupId, tgMessage);

    console.log(`✅ Task notification sent: ${taskId} (${status})`);
  } catch (error) {
    console.error("❌ Task notification error:", error);
  }
}

async function notifyTelegram(chatId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  console.log("🔐 TELEGRAM_BOT_TOKEN exists:", !!token);
  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN not configured in environment");
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  try {
    console.log("📤 Sending Telegram message to chat:", chatId);
    console.log("📝 Message length:", message.length);

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    console.log("🌐 Calling Telegram API at:", url.replace(token, "***"));

    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };
    console.log("📦 Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("📊 Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Telegram API returned error:", errorText);
      throw new Error(`Telegram API error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log("✅ Telegram message sent successfully. Result:", result);
  } catch (error) {
    console.error("❌ Telegram send error:", error);
    throw error;
  }
}
