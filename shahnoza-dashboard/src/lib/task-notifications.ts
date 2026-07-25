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

const MISSED_DEADLINE_MESSAGES = [
  "[NAME], vaqt mashinasi orqaga aylanmaydi! Yangi muddat [NEW_DATE] – Optimus Prime hali ham kutmoqda 🤖⏰",
  "Decepticon hiles! [NAME], muddatni [OLD_DATE]dan [NEW_DATE]ga o'tkazdingiz? Energon zaxirasini yig'ing! ⚡",
  "[NAME], Autobot qonuni: vaqt bilan o'ynamax! [NEW_DATE] = yangi imtihon, yangi buningni! 🔥",
  "Spark yo'q boshla, [NAME]! Soat [NEW_DATE]ga o'zgartirildi – Transform qiling, dajal qiling! 💫",
  "[NAME], eski muddat [OLD_DATE] – yangi muddat [NEW_DATE]. Matrix sizni kutmoqda! ⚡🎯",
  "Vaqtning Decepticoni! [NAME], muddatni qisqartirdingiz – endi super tezlikda ishlang! 🚀",
  "[NAME], xavf signali! [NEW_DATE] yangi jayx – Transformers tezlik bilan tayyor bo'lsinlar! 🤖⚠️",
  "Optimus Prime aytadi: Vaqtni qayta yo'qotix bo'lmadi, [NAME]! Yangi muddat – [NEW_DATE]. Roll out! 🔴",
];

const DEADLINE_EXTENDED_MESSAGES = [
  "[NAME], Optimus Prime xushid! Muddat [OLD_DATE]dan [NEW_DATE]ga uzaytrildi – [DAYS_EXTENDED] kun bonus Energon! 🎉⚡",
  "Ikkinchi nafas! [NAME], vaqt [DAYS_EXTENDED] kun ko'paydi – Transformers qayta kuchlanadi! 💪🤖",
  "[NAME], Autobot shafqati! Muddat uzaytrildi, yangi kuch [NEW_DATE]ga kelyapti! 🌟",
  "Zafar yaqin! [NAME], [DAYS_EXTENDED] kun qo'shimcha – bu vaqt spark qaytarish uchun! 🔥✨",
  "[NAME], Prime Size imkoniyat! [OLD_DATE] → [NEW_DATE] – [DAYS_EXTENDED] kun hayot bergan! 🎯",
  "Qo'shimcha Energon keldi! [NAME], [DAYS_EXTENDED] kun yangi imkoniyat – Transform qilish uchun vaqt! 🚀⭐",
  "[NAME], muromaza sharifi! Muddat [DAYS_EXTENDED] kun yana uzaytrildi – Matrix sizni o'ng tomonda ko'rmoqda! 💫",
  "Transformers ehtiyoji! [NAME], yangi muddat [NEW_DATE] – kuchlaningiz, roll out! 🔴🌈",
];

const DEADLINE_SHORTENED_MESSAGES = [
  "DAJAL! [NAME], muddat [DAYS_SHORTENED] kunka qisqartirildi! [NEW_DATE]ga tayyorlanin – Autobots rol! 🚨⚡",
  "[NAME], tezlik vaqti! [OLD_DATE]dan [NEW_DATE]ga – [DAYS_SHORTENED] kunlik jang boshlandi! 🤖💨",
  "Matrix vaqti! [NAME], muddat qisqarildi! [DAYS_SHORTENED] kun qoldi – Prime speedda ishlang! 🔥⏰",
  "[NAME], Decepticon atakasi! [DAYS_SHORTENED] kunda tayyorlig' – Transform qiling, yangi quvvatda! 💪🎯",
  "Vaqt kompressori! [NAME], muddat [NEW_DATE] – [DAYS_SHORTENED] kun – Super Optimus rejimi! 🚀⚡",
  "[NAME], energon tezligi! [DAYS_SHORTENED] kun qoldi – Autobot hushyarligi bilan ishlang! 🔴💫",
  "Shumlashish vaqti! [NAME], muddat [OLD_DATE]dan [NEW_DATE]ga – [DAYS_SHORTENED] kunlik Transformers tezligi! 🌪️",
  "Prime jumboq! [NAME], [DAYS_SHORTENED] kunli deadline – eng kuchli rejimingizni yoqing! 🔥🤖",
];

const FINISHED_VERY_LATE_MESSAGES = [
  "[NAME], nihoyat! [DAYS_LATE] kundan keyin reboot boshlandi – Optimus Prime siz uchun xosh! 🤖✨",
  "Resurrection time! [NAME], [DAYS_LATE] kun kechikish orqali qayta ko'rildi – Spark qaytari! 🔥💫",
  "[NAME], Transformers sabri tugatildi! [DAYS_LATE] kundan keyin muqaddas vaqti – ajab! 🎉",
  "Decepticon ketdi, topildi! [NAME], [DAYS_LATE] kunlik yolatdan qaytish – jayx tugamalandi! 🌟⚡",
  "[NAME], Autobot ehtiramlari! [DAYS_LATE] kunda tayyorlandingiz – Matrix sizni kutyaptir! 🏆🤖",
  "Prime koyilga qaytdi! [NAME], [DAYS_LATE] kunli Energon yo'lida oxirida – Roll out! 🔴✨",
  "[NAME], yoki ne! [DAYS_LATE] kundi kechikish orqali oxiri topa borildi – Transformers halikam soqdi! 💪",
  "Miroitli finish! [NAME], [DAYS_LATE] kun kechikib tugagansiz – Optimus Prime shunovni taxmin qiladi! 🎯🌟",
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
  console.log("📅 notifyDeadlineMissed called", { taskId, oldDueDate, newDueDate });
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

    const tgMessage = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n⚠️ Reason: Deadline moved earlier after passing`;
    await notifyTelegram(settings.value, tgMessage);
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
  console.log("📅 notifyDeadlineExtended called", { taskId, oldDueDate, newDueDate });
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

    const tgMessage = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n✨ Extra time: +${daysExtended} days`;
    await notifyTelegram(settings.value, tgMessage);
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
  console.log("📅 notifyDeadlineShortened called", { taskId, oldDueDate, newDueDate });
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

    const tgMessage = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n⏱️ Deadline moved: -${daysShortenend} days`;
    await notifyTelegram(settings.value, tgMessage);
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
  console.log("📅 notifyFinishedVeryLate called", { taskId, dueDate, completedAt });
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

    const tgMessage = `${message}\n\n📌 Task: ${taskTitle}\n👤 Owner: @${ownerName}\n✅ Completed by: @${completedBy.name || "unknown"}\n⏳ Days late: ${daysLate}`;
    await notifyTelegram(settings.value, tgMessage);
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
