/**
 * The Shahnoza lead-magnet funnel — 40-message, two-act drip, as a typed graph.
 * Act 1 (s1–s20): warm-up (origin, proof, objections) → phone + poll.
 * Act 2 (s21–s40): sells the course (modules, bonus stack, tariffs, scarcity,
 * guarantee) → call. PRICE IS NEVER SENT — it is only revealed on the call.
 *
 * Media (photos/voice/video) are SLOTS with stable keys — empty for now; fill
 * MEDIA below (Telegram file_id or a public URL) and the bot sends them.
 * `[ism]` in any text is replaced with the subscriber's first name at send time.
 */

export type Segment = "tajriba" | "vaqt" | "pul" | "ishonch";

export interface MediaSlot {
  key: string;
  kind: "photo" | "video" | "voice" | "document";
}

export interface FlowButton {
  text: string;
  next?: string; // advance the flow to this step
  url?: string; // open a link (does not advance)
  segment?: Segment; // record a segment, then advance to `next`
}

export type FlowStep =
  // auto-advances to `next` in the same pass (optional link-only buttons)
  | { id: string; type: "message"; text: string; media?: MediaSlot; urlButtons?: FlowButton[]; next: string }
  // sends text (+ media) with a single "continue" button; waits for the tap
  | { id: string; type: "continue"; text: string; media?: MediaSlot; label?: string; next: string }
  // sends text with several buttons; waits for a tap (branch / segment)
  | { id: string; type: "buttons"; text: string; media?: MediaSlot; buttons: FlowButton[] }
  // asks for the phone via a contact-request button; on share → capture + next
  | { id: string; type: "ask_phone"; text: string; buttonText: string; next: string }
  // asks for a free-text answer we store (e.g. city); next on reply
  | { id: string; type: "ask_text"; text: string; field: "city"; next: string }
  // wait, then continue to `next` (resumed by the cron tick)
  | { id: string; type: "delay"; minutes: number; next: string }
  // side effect (mark lead / call requested / cold, notify sales), then next
  | { id: string; type: "action"; action: "mark_lead" | "mark_call_requested" | "mark_cold" | "notify_sales"; next?: string }
  // terminal
  | { id: string; type: "end"; text?: string; status?: string };

const CONTINUE = "Davom etish →";

/** Fill these when you have the media (Telegram file_id after first upload, or a
 *  public URL). Leave a key out and the bot just sends that step's text. */
export const MEDIA: Record<string, { fileId?: string; url?: string }> = {
  // lesson_free: { url: "https://..." },
  // parizoda: { fileId: "AgAC..." },
};

export const FLOW_KEY = "lead_magnet_v1";

export const FLOW: FlowStep[] = [
  // ─────────────────────────── ACT 1 — WARM-UP ───────────────────────────
  {
    id: "s1",
    type: "message",
    text: `Assalomu alaykum, [ism]! 🌿\nBepul darsingiz tayyor — bolalar massaji orqali, oilangiz yonida turib, halol daromadga chiqish yo'li.`,
    media: { key: "lesson_free", kind: "video" },
    urlButtons: [{ text: "🎥 Bepul darsni ko'rish", url: "" }],
    next: "s1_wait",
  },
  { id: "s1_wait", type: "delay", minutes: 90, next: "s2" },
  {
    id: "s2",
    type: "buttons",
    text: `[ism], darsni ko'rib ulgurdingizmi? 🙂`,
    buttons: [
      { text: "Ha ✅", next: "s3" },
      { text: "Hali yo'q ⏳", next: "s2_no" },
    ],
  },
  {
    id: "s2_no",
    type: "message",
    text: `Zarari yo'q — 45 daqiqa, bola uxlaganda ko'ring 👇`,
    urlButtons: [{ text: "🎥 Ochish", url: "" }],
    next: "s2_no_wait",
  },
  { id: "s2_no_wait", type: "delay", minutes: 1440, next: "s2_reminder" },
  {
    id: "s2_reminder",
    type: "buttons",
    text: `[ism], darsni ko'rdingizmi? Ko'rib bo'lsangiz, keyingi qadamga o'tamiz 👇`,
    buttons: [{ text: "Ko'rdim ✅", next: "s3" }],
  },
  {
    id: "s3",
    type: "ask_phone",
    text: `Zo'r! Yo'lni ko'rdingiz. Shaxsan yordam beray — raqamingizni qoldiring, bepul yo'l-xaritasi va "Birinchi mijozgacha 10 kun" qo'llanmam beraman 👇`,
    buttonText: "📱 Raqamni qoldirish",
    next: "s4",
  },
  { id: "s4", type: "message", text: `Rahmat, [ism]! Tez orada bog'lanamiz. Hozircha bir necha narsa aytib beray 👇`, next: "s5" },
  {
    id: "s5",
    type: "continue",
    text: `[ism], o'zim haqimda ochig'ini aytay. 2011-yil, oddiy hamshira edim — 1 million 700 ming oylik. Bir kuni esimda: oyim oxirida qo'limda pul qolmagan, bolamga kerakli narsani ololmaganman. O'sha kuni yig'laganman. "Shuncha o'qidim, oliy toifali hamshiraman — nega ahvolim shu?" deb. O'shanda tushundim: ayb menda emas edi. Ayb — tizimda. Poliklinika sizning vaqtingizni arzon sotib oladi, bilimingizni emas. Qancha ishlamang, o'zgarmaydi. Men o'sha kuni qaror qildim — bu tizimdan chiqaman, deb. Va chiqdim. Endi sizni ham chiqaraman.`,
    next: "s6",
  },
  { id: "s6", type: "continue", text: `Parizoda ham shu yerda edi — hamshira, 3 million, ijarada. Bir yilda oyiga 10 million, o'z uyi. Farqi yo'q edi — yo'lni topdi.`, media: { key: "parizoda", kind: "photo" }, next: "s7" },
  {
    id: "s7",
    type: "continue",
    text: `[ism], endi eng muhim haqiqatni aytaman. Parizoda omad topmadi. Iqtidori ham sizdan ortiq emas edi. U shunchaki bitta narsani — TIZIMNI topdi.\n\nPoliklinikada siz VAQTINGIZNI sotasiz. Vaqt esa dunyodagi eng arzon narsa — kuniga 24 soat, tamom. Mutaxassis esa vaqtini emas — NATIJASINI sotadi. Bir seans 150 ming so'm. Ona sizning soatingiz uchun emas, farzandi tuzalishiga yordam bergani uchun to'laydi. Va natijaning shifti yo'q.\n\nXuddi shu qo'l. Xuddi shu bilim. Xuddi shu siz. Biri — poliklinikada 3 million. Biri — o'z ishida 10 million. Farq malakada emas — MODELDA. Va men sizga aynan o'sha modelni beraman.`,
    next: "s8",
  },
  {
    id: "s8",
    type: "buttons",
    text: `[ism], ayting-chi, hozir sizni nima ko'proq to'xtatyapti?`,
    buttons: [
      { text: "Tajribam yo'q", segment: "tajriba", next: "s8_city" },
      { text: "Vaqtim", segment: "vaqt", next: "s8_city" },
      { text: "Pulim", segment: "pul", next: "s8_city" },
      { text: "Ishonmayman", segment: "ishonch", next: "s8_city" },
    ],
  },
  { id: "s8_city", type: "ask_text", field: "city", text: `Rahmat! Va bitta iltimos — shahringizni yozib qoldiring 👇 (qaysi shahardan ekaningizni bilsam, sizga yaqinroq misollar keltiraman)`, next: "s9" },
  { id: "s9", type: "continue", text: `Nilufar — bog'cha hamshirasi, savollari javobsiz qolardi. Bugun o'z markazi, 20 million. Farqi: yolg'iz qolmadi, kurator har qadamda.`, media: { key: "nilufar", kind: "photo" }, next: "s10" },
  { id: "s10", type: "continue", text: `Ma'mura — eri xorijda, depressiyada, 0 daromad. Bugun o'z markazi, 15 million. Holati emas — yo'li o'zgardi.`, media: { key: "mamura", kind: "photo" }, next: "s11" },
  { id: "s11", type: "continue", text: `"Tajribam yo'q"? Ra'no 55 yoshda 0 dan 15 millionga. Muslima 18 yoshda 0 dan 10 millionga. Sizda tibbiy poydevor bor — yarim yo'ldan boshlaysiz.`, media: { key: "rano_muslima", kind: "photo" }, next: "s12" },
  {
    id: "s12",
    type: "continue",
    text: `[ism], bir daqiqa ko'zingizni yumib, tasavvur qiling. 90 kundan keyingi ertalab. Budilnik yo'q. Boshqa birovning smenasiga yugurmaysiz. Bolangizni o'zingiz uyg'otasiz, maktabga kuzatasiz — shoshilmasdan.\n\nTelefoningizga xabar keladi: "Assalomu alaykum opa, ertaga farzandimni seansga yozsam bo'ladimi?" Bu — sizning mijozingiz. Kunduzi 2-3 seans qilasiz. Oy oxirida uyga o'z pulingizni o'zingiz kiritasiz. Erdan so'ramasdan.\n\nBolangiz "onam mutaxassis" deb faxrlanadi. Mana shu — men sizga bermoqchi bo'lgan hayot. Va bu xayol emas — Parizoda, Nilufar, Ma'mura buni yashayapti.`,
    next: "s12b",
  },
  { id: "s12b", type: "continue", text: `[ism], ertaga ertalab sizga bitta shogirdimning O'Z OVOZIDAGI xabarini yuboraman — u qanday boshlaganini o'zi aytib beradi. Uni albatta eshiting, sizga juda tanish tuyuladi. Hozircha — davom etamiz 👇`, next: "s13" },
  { id: "s13", type: "continue", text: `Iroda — 0 daromad, farzandlari kichik edi. Bugun uydan chiqmay o'z bemor bazasi, 20 million. Kichik bola to'siq emas.`, media: { key: "iroda", kind: "photo" }, next: "s13b" },
  { id: "s13b", type: "continue", text: `[ism], mana — va'da qilganimdek. Nilufardan kelgan ovozli xabar 👆 Eshitdingizmi? U ham xuddi siz kabi ikkilangan edi. Farq — bitta qaror qildi.`, media: { key: "nilufar_voice", kind: "voice" }, next: "s14" },
  { id: "s14", type: "continue", text: `"Vaqtim yo'q" — har dars 15-20 daqiqa, telefonda, o'z tezligingizda. Bu kasb vaqtni oiladan olmaydi — uyda, bola yonida ishlaysiz.`, next: "s15" },
  { id: "s15", type: "continue", text: `Muhlisahon — oilasi buzilish arafasida edi. Bugun massajist, 10 million, oilasini saqladi, mijoz duosini oladi.`, media: { key: "muhlisahon", kind: "photo" }, next: "s16" },
  { id: "s16", type: "continue", text: `"Erim ruxsat bermasa?" Bu kasb oiladan uzoqlashtirmaydi — uyda ishlaysiz. Ko'p eri boshda ikkilangan, keyin eng katta tarafdori bo'lgan. Qo'ng'iroqqa eringiz bilan chiqing — o'zim gaplashaman.`, next: "s17" },
  { id: "s17", type: "continue", text: `Dilnoza narxini oshira olmasdi, 500 ming edi. Bugun bosh master, 15 million. Gap ko'p ishlashda emas — to'g'ri qilishda.`, media: { key: "dilnoza", kind: "photo" }, next: "s18" },
  { id: "s18", type: "continue", text: `"Pulim yetmasa?" — bo'lib to'lash bor, ko'p shogird birinchi mijozidan qopladi. "Halolmi?" — ha: bola sog'lig'iga xizmat, ona duosi, halol pul.`, next: "s19" },
  { id: "s19", type: "continue", text: `[ism], sizga 14 shogird hikoyasini ko'rsatyapman — hamshira, uy bekasi, talaba edi. Bugun o'z daromadi bor. Keyingisi siz bo'lishingiz mumkin.`, next: "s20" },
  { id: "s20", type: "continue", label: "Ko'rsating →", text: `Endi eng muhimi — sizga bu tizim aynan nimadan iboratligini, nima olishingizni ko'rsatay 👇`, next: "s21" },

  // ─────────────────────────── ACT 2 — SELLS ───────────────────────────
  { id: "s21", type: "continue", text: `[ism], shu yergacha keldingiz — demak, jiddiysiz. Ko'p odam "kurs sotib olaman" deb o'ylaydi: video ko'radi, daftar to'ldiradi, keyin… hech narsa o'zgarmaydi. Chunki ular BILIM oldi, lekin YO'L olmadi.\n\nMen sizga to'liq tizim beraman: bilim + kim yoningizda turadi + mijozni qanday topasiz + qanday pul ishlaysiz. Bosqichma-bosqich, boshidan oxirigacha. Keling, ichida nima borligini ko'rsatay 👇`, next: "s22" },
  { id: "s22", type: "continue", text: `1-modul — Anatomik diagnostika. Bolalar anatomiyasi, muammoni uy sharoitida aniqlash, tekis oyoq, bo'yin qiyshiqligi. Siz muammoni erta ko'radigan mutaxassisga aylanasiz.`, next: "s23" },
  { id: "s23", type: "continue", text: `2-modul — Kompleks fizioterapiya. Faqat massaj emas: LFK, elektroforez, parafin. Har qanday yoshdagi bolaga professional seans o'tkazasiz.`, next: "s24" },
  { id: "s24", type: "continue", text: `3-modul — Kamyob mutaxassislik + marketing. Logopedik massaj, gidromassaj, kam vaznli chaqaloqlar — talab eng yuqori yo'nalishlar. VA mijoz topish, narx qo'yish, sotish. Kursni tugatib — bitta texnika emas, butun kasb egasi bo'lasiz.`, next: "s25" },
  { id: "s25", type: "continue", text: `Endi bonuslar. 🎁 1-chi: shaxsiy kurator. Har vazifangizni 48 soatda tekshiradi. Massajingizni videoga olib yuborasiz — biz aniq to'g'rilaymiz. Yolg'iz qolmaysiz.`, next: "s26" },
  { id: "s26", type: "continue", text: `🎁 2-chi: "Birinchi mijozgacha 15 kun" tizimi — kundan-kunga aniq nima qilish. Parizoda, Nilufar, Ma'mura — hammasi shu tizimdan o'tdi.`, next: "s27" },
  { id: "s27", type: "continue", text: `🎁 3-chi: tayyor marketing. 30 kunlik Instagram reja + 20 professional shablon + narx qo'yish darsi. Birinchi kundan professional ko'rinasiz.`, next: "s28" },
  { id: "s28", type: "continue", text: `🎁 4-chi: professional sertifikat — onalar va shifokorlar oldida ishonch, narxingizni oshirish huquqi. + Umrbod hamjamiyat + yangi darslar bepul + haftalik jonli savol-javob men bilan.`, next: "s29" },
  { id: "s29", type: "continue", text: `[ism], bir nafasda hammasini birga ko'ring. Siz olasiz:\n✓ Butun bir kasb — 3 modul, 20 dars\n✓ Shaxsiy kurator — har qadamda yoningizda\n✓ "Birinchi mijozgacha 15 kun" tizimi\n✓ Tayyor marketing — Instagram reja + 20 shablon + narx qo'yish\n✓ Professional sertifikat\n✓ Umrbod hamjamiyat + yangi darslar bepul + haftalik jonli efir\n\nBu — kurs emas. Bu — yangi hayotning to'liq kaliti.`, next: "s30" },
  { id: "s30", type: "continue", text: `Va risk menda, sizda emas:\n🛡 14 kun yoqmasa — 100% pul qaytadi.\n🛡 90 kun ichida vazifani qilib ham birinchi mijoz topilmasa — topilguncha bepul ishlayman.`, next: "s31" },
  { id: "s31", type: "continue", text: `Uch yo'l bor, o'zingizga mosini tanlaysiz:\nBAZA — "o'z bolam uchun"\nKASB — "professional kasb egasi" ⭐ (to'liq tizim, barcha bonuslar)\nBIZNES — "o'z markazim" (KASB + men bilan shaxsiy ish + jonli amaliyot)\n\nQaysi biri sizga mos — qo'ng'iroqda, holatingizga qarab birga tanlaymiz.`, next: "s32" },
  { id: "s32", type: "continue", text: `Hisob oddiy: bir seans 150 ming × kuniga 3 = oyiga 9 million+. Ko'p shogird birinchi oydayoq to'lovni qopladi. Kasb o'zini oqlaydi.`, next: "s33" },
  { id: "s33", type: "continue", text: `To'lov haqida ham o'ylaganmiz: Uzum Nasiya orqali bo'lib to'lash mumkin. Katta summani birdan chiqarish shart emas. Batafsil — qo'ng'iroqda.`, next: "s34" },
  { id: "s34", type: "continue", text: `Hali ikkilanyapsizmi? Muqaddas maktab oshpazi edi — bugun 20 million. Nazokathon 19 yoshli talaba — bugun 20 million, oliygohni o'zi to'laydi. Ular ham xuddi shu tizimdan o'tdi.`, media: { key: "muqaddas_nazokat", kind: "photo" }, next: "s35" },
  { id: "s35", type: "continue", text: `[ism], ochiq aytaman: men hammaga o'rgatmayman. Menga jiddiy, natija ko'rsatadigan odam kerak. Qo'ng'iroqda men ham sizni tekshiraman — tayyormisiz, bu yo'l sizga mosmi.`, next: "s36" },
  { id: "s36", type: "continue", text: `Va o'rinlar cheklangan — kurator har o'quvchini sifatli kuzatishi kerak, yuzlab odamni bo'lmaydi. Guruh to'lganda, keyingi oqim keyinroq.`, next: "s37" },
  {
    id: "s37",
    type: "buttons",
    text: `Endi bitta qadam qoldi: qo'ng'iroq. Bepul, bosimsiz. Sizga qaysi tarif mosligini, narx va Nasiya shartlarini o'sha yerda gaplashamiz. Hech narsa olmasangiz ham — 17 yillik mutaxassisdan bepul yo'l-xaritasi. Tayyor bo'lsangiz 👇`,
    buttons: [{ text: "Suhbatga yozilish →", next: "s37_action" }],
  },
  { id: "s37_action", type: "action", action: "mark_call_requested", next: "s37_notify" },
  { id: "s37_notify", type: "action", action: "notify_sales", next: "s38" },
  {
    id: "s38",
    type: "buttons",
    text: `Zo'r! Sizga qachon qulay?`,
    buttons: [
      { text: "Bugun kechqurun", next: "s39" },
      { text: "Ertaga", next: "s39" },
    ],
  },
  { id: "s39", type: "message", text: `⚠️ Eslatma: to'lov faqat rasmiy kanal orqali. Firibgarlar bizning nomdan yozishi mumkin — begona kartaga to'lov qilmang.`, next: "s40" },
  { id: "s40", type: "end", status: "call_requested", text: `Rahmat, [ism]! Belgilangan vaqtda bog'lanamiz. Savolingiz bo'lsa — shu yerga yozing. Sizga omad! 🌿` },
];

const BY_ID: Record<string, FlowStep> = Object.fromEntries(FLOW.map((s) => [s.id, s]));
export function getStep(id: string): FlowStep | undefined {
  return BY_ID[id];
}
export const ENTRY_STEP = "s1";
