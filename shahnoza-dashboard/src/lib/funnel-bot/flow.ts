/**
 * Shahnoza lead-magnet funnel — 40 messages (+ 2 sub-steps), full AUTO-SEND drip.
 *
 * Design:
 *   • Every message auto-sends on a timer — no "continue" taps, no branching.
 *   • Buttons are outbound links only (call-to-action to admin DM). Buttons
 *     never advance the flow — the timer does.
 *   • Free-text replies stop the drip and hand the person to a human.
 *
 * Media slots are filled via the dashboard (Bot → Media). Until filled the
 * bot sends the step's text only, so the funnel runs immediately.
 * `[ism]` in any text is replaced with the subscriber's first name at send time.
 *
 * Total: 43 message steps + 42 delay steps + 1 end = 86 steps.
 */

export type Segment = "tajriba" | "vaqt" | "pul" | "ishonch";

export interface MediaSlot {
  key: string;
  kind: "photo" | "video" | "voice" | "document";
}

export interface FlowButton {
  text: string;
  next?: string;
  url?: string;
  segment?: Segment;
}

export type FlowStep =
  | { id: string; type: "message"; text: string; media?: MediaSlot; urlButtons?: FlowButton[]; next: string }
  | { id: string; type: "continue"; text: string; media?: MediaSlot; label?: string; next: string }
  | { id: string; type: "buttons"; text: string; media?: MediaSlot; buttons: FlowButton[] }
  | { id: string; type: "ask_phone"; text: string; buttonText: string; next: string }
  | { id: string; type: "ask_text"; text: string; field: "city"; next: string }
  | { id: string; type: "delay"; minutes: number; next: string }
  | { id: string; type: "action"; action: "mark_lead" | "mark_call_requested" | "mark_cold" | "notify_sales"; next?: string }
  | { id: string; type: "end"; text?: string; status?: string };

const ADMIN = "https://t.me/shahnoza_soliyeva_admin1";

/** Media slots — filled from the dashboard (Bot → Media panel). */
export const MEDIA: Record<string, { fileId?: string; url?: string }> = {};

export const FLOW_KEY = "lead_magnet_v1";

export const FLOW: FlowStep[] = [
  // ── DAY 1 — messages 1–9 ──────────────────────────────────────────────────

  // 1 (t+0) — welcome + free lesson button
  {
    id: "m1", type: "message",
    text: `Salom! 🌿\n\n[ism], menga yozganingiz tasodif emas — to'g'ri vaqtda, to'g'ri joydasiz.\n\nMen Shahnoza Soliyeva — oliy toifali hamshira, 17 yillik tajriba. So'nggi yilda 14 nafar oddiy hamshirani — sizga o'xshash ayollarni — o'z daromadiga olib chiqdim.\n\nSizga bepul darsni yuboryapman — "Hamshiralikdan halol daromadga" 45 daqiqa. Ko'ring 👇`,
    media: { key: "v2_photo_shahnoza", kind: "photo" },
    urlButtons: [{ text: "🎥 Bepul Darsni Ko'rish", url: "" }],
    next: "d1",
  },
  { id: "d1", type: "delay", minutes: 5, next: "m2" },

  // 2 (+5 min) — channel invite + welcome video
  {
    id: "m2", type: "message",
    text: `Siz shu yerdasiz 🚀\n\n[ism], tabriklayman — eng birinchilar orasidasiz.\n\nMen maxsus kanal ochdim — u yerda har kuni:\n✅ Real shogirdlarim natijalari (o'z ovozi, o'z yuzi bilan)\n✅ Bepul mini-darslar — boshqa hech qayerda yo'q\n✅ Eng qimmatli: 10 millionlik shogirdim yo'lini to'liq bosqichma-bosqich\n\nBu kanal — sizning yangi hayotingiz boshlanadigan joy. ALBATTA qo'shiling 👇`,
    media: { key: "v2_video_dars", kind: "video" },
    urlButtons: [{ text: "📢 KANALGA QO'SHILISH — bepul", url: "" }],
    next: "d2",
  },
  { id: "d2", type: "delay", minutes: 30, next: "m3" },

  // 3 (+30 min) — nudge to finish the lesson
  {
    id: "m3", type: "message",
    text: `[ism], darsni ochdingizmi?\n\nIltimos, oxirigacha ko'ring — eng muhim qism aynan oxirida. Ko'pchilik shu daqiqada "men ham qila olarkanman" deb tushunadi.`,
    next: "d3",
  },
  { id: "d3", type: "delay", minutes: 120, next: "m4" },

  // 4 (+2 soat) — objection probe
  {
    id: "m4", type: "message",
    text: `[ism], ayting-chi — hozir sizni nima ko'proq to'xtatyapti?\n\nPastga yozing: tajribami, vaqtmi, pulmi, ishonchmi?\n\nO'qib, javob beraman. Va shahringizni ham yozing 🙂`,
    next: "d4",
  },
  { id: "d4", type: "delay", minutes: 60, next: "m5" },

  // 5 (+1 soat) — origin voice 1
  {
    id: "m5", type: "message",
    text: `[ism], o'zim haqimda ochig'ini aytay.\n\n2011-yil, oddiy hamshira, 1 million 700 ming. Bir kuni oy oxirida qo'limda pul qolmagan, bolamga kerakli narsani ololmaganman. O'sha kuni yig'laganman.`,
    media: { key: "v2_audio_origin", kind: "voice" },
    next: "d5",
  },
  { id: "d5", type: "delay", minutes: 120, next: "m6" },

  // 6 (+2 soat) — origin voice 2
  {
    id: "m6", type: "message",
    text: `"Shuncha o'qidim, oliy toifali hamshiraman — nega ahvolim shu?" derdim.\n\nO'shanda tushundim: ayb menda emas — TIZIMDA. Poliklinika vaqtingizni arzon sotib oladi, bilimingizni emas.\n\nMen o'sha kuni qaror qildim: chiqaman. Va chiqdim. Sizni ham chiqaraman.`,
    media: { key: "v2_audio_tizim", kind: "voice" },
    next: "d6",
  },
  { id: "d6", type: "delay", minutes: 180, next: "m7" },

  // 7 (+3 soat) — Parizoda story
  {
    id: "m7", type: "message",
    text: `Parizoda ham shu yerda edi — hamshira, 3 million, ijarada.\n\nBir yilda oyiga 10 million, o'z uyi.\n\nFarqi yo'q edi — yo'lni topdi.`,
    media: { key: "v2_photo_parizoda", kind: "photo" },
    next: "d7",
  },
  { id: "d7", type: "delay", minutes: 120, next: "m8" },

  // 8 (+2 soat) — the mechanism
  {
    id: "m8", type: "message",
    text: `[ism], Parizoda omad topmadi — TIZIMNI topdi.\n\nPoliklinikada VAQTINGIZNI sotasiz — kuniga 24 soat, tamom. Mutaxassis NATIJASINI sotadi. Bir seans 150 ming: ona farzandi tuzalishiga yordam bergani uchun to'laydi, soatingizga emas.\n\nShu qo'l, shu bilim — biri 3, biri 10 million. Farq MODELDA.`,
    next: "d8",
  },
  { id: "d8", type: "delay", minutes: 60, next: "m9" },

  // 9 (+1 soat) — it's learnable
  {
    id: "m9", type: "message",
    text: `Va bu model o'rganiladi.\n\nMen uni 14 hamshiraga o'rgatdim. Ular ham xuddi sizdek boshlagan. Endi navbat sizda.`,
    next: "d9",
  },
  { id: "d9", type: "delay", minutes: 240, next: "m10" },

  // ── DAY 2 — messages 10–15 ────────────────────────────────────────────────

  // 10 (+4 soat, day-2 bridge)
  {
    id: "m10", type: "message",
    text: `[ism], kecha ko'rsatgan yo'l haqida o'ylayapsizmi?\n\nBugun yana bir dalil — real odam, real natija. Hammasi boshlanadi bir qarordan.`,
    next: "d10",
  },
  { id: "d10", type: "delay", minutes: 1440, next: "m11a" },

  // 11a (+1 kun) — Nilufar
  {
    id: "m11a", type: "message",
    text: `Nilufar — bog'cha hamshirasi, savollari javobsiz qolardi.\n\nBugun o'z markazi, 20 million. Yolg'iz qolmadi — kurator har qadamda.`,
    media: { key: "v2_photo_nilufar", kind: "photo" },
    next: "d11a",
  },
  { id: "d11a", type: "delay", minutes: 30, next: "m11b" },

  // 11b (+30 min) — "no experience" objection
  {
    id: "m11b", type: "message",
    text: `"Tajribam yo'q"?\n\nRa'no 55 yoshda 0 dan 15 millionga. Muslima 18 yoshda 0 dan 10 millionga.\n\nSizda tibbiy poydevor bor — yarim yo'ldan boshlaysiz.`,
    next: "d11b",
  },
  { id: "d11b", type: "delay", minutes: 360, next: "m12" },

  // 12 (+6 soat) — Ma'mura
  {
    id: "m12", type: "message",
    text: `Ma'mura — eri xorijda, depressiyada, 0 daromad.\n\nBugun o'z markazi, 15 million. Holati emas — yo'li o'zgardi.`,
    media: { key: "v2_photo_mamura", kind: "photo" },
    next: "d12",
  },
  { id: "d12", type: "delay", minutes: 180, next: "m13" },

  // ── DAY 3 — messages 13–20 ────────────────────────────────────────────────

  // 13 (+3 soat) — future pacing voice
  {
    id: "m13", type: "message",
    text: `[ism], ko'zingizni yuming.\n\n90 kundan keyingi ertalab. Budilnik yo'q. Bolangizni o'zingiz uyg'otasiz. Telefonga: "Opa, farzandimni seansga yozsam?" — sizning mijozingiz. Oy oxirida uyga o'z pulingizni kiritasiz, erdan so'ramasdan. Bolangiz "onam mutaxassis" deb faxrlanadi.`,
    media: { key: "v2_audio_future", kind: "voice" },
    next: "d13",
  },
  { id: "d13", type: "delay", minutes: 240, next: "m14" },

  // 14 (+4 soat) — not a dream
  {
    id: "m14", type: "message",
    text: `Bu xayol emas, [ism].\n\nParizoda, Nilufar, Ma'mura shu hayotni yashayapti. Sizdan farqi — ular bir yil oldin QAROR qildi.`,
    next: "d14",
  },
  { id: "d14", type: "delay", minutes: 15, next: "m15" },

  // 15 (+15 min) — Iroda + Muhlisa
  {
    id: "m15", type: "message",
    text: `Iroda — 0 daromad, bolalari kichik. Bugun uydan chiqmay 20 million.\n\nMuhlisahon — oilasi buzilish arafasida edi, bugun 10 million, oilasini saqladi.`,
    media: { key: "v2_photo_iroda_muhlisa", kind: "photo" },
    next: "d15",
  },
  { id: "d15", type: "delay", minutes: 180, next: "m16" },

  // 16 (+3 soat) — no time objection
  {
    id: "m16", type: "message",
    text: `"Vaqtim yo'q"?\n\nHar dars 15–20 daqiqa, telefonda, bola uxlaganda. Bu kasb vaqtni oiladan olmaydi — uyda, bola yonida ishlaysiz.`,
    next: "d16",
  },
  { id: "d16", type: "delay", minutes: 1440, next: "m17" },

  // ── DAY 4 — messages 17–20 ────────────────────────────────────────────────

  // 17 (+1 kun) — husband's permission
  {
    id: "m17", type: "message",
    text: `"Erim ruxsat bermasa?"\n\nBu kasb oiladan uzoqlashtirmaydi — uyda ishlaysiz. Ko'p eri boshda ikkilangan, keyin eng katta tarafdori bo'lgan.\n\nXohlasangiz, qo'ng'iroqqa eringiz bilan chiqing.`,
    next: "d17",
  },
  { id: "d17", type: "delay", minutes: 180, next: "m18" },

  // 18 (+3 soat) — Dilnoza + Muqaddas
  {
    id: "m18", type: "message",
    text: `Dilnoza — 500 ming edi, bugun bosh master, 15 million.\n\nMuqaddas — maktab oshpazi edi, bugun 20 million.\n\nHar xil hayot, bir xil natija — tizim bir.`,
    media: { key: "v2_photo_dilnoza_muqaddas", kind: "photo" },
    next: "d18",
  },
  { id: "d18", type: "delay", minutes: 180, next: "m19" },

  // 19 (+3 soat) — money + halal objections
  {
    id: "m19", type: "message",
    text: `"Pulim yetmasa?" — bo'lib to'lash bor, ko'p shogird birinchi mijozidan qopladi.\n\n"Halolmi?" — ha: bola sog'lig'iga xizmat, ona duosi, halol pul.`,
    next: "d19",
  },
  { id: "d19", type: "delay", minutes: 120, next: "m20" },

  // 20 (+2 soat) — Nazokathon + Nigora
  {
    id: "m20", type: "message",
    text: `Nazokathon — 19 yoshli talaba, 0 dan 20 millionga, oliygohni o'zi to'laydi.\n\nNigora — 500 mingdan 15 millionga.\n\nYosh, tajriba — to'siq emas.`,
    next: "d20",
  },
  { id: "d20", type: "delay", minutes: 1440, next: "m21" },

  // ── DAY 5 — messages 21–24b ───────────────────────────────────────────────

  // 21 (+1 kun) — free roadmap call offer
  {
    id: "m21", type: "message",
    text: `[ism], siz hali qadam bosmadingiz — shuning uchun aytaman.\n\nQo'ng'iroqda BEPUL yo'l-xaritasi beraman: holatingizga qarab qaysi qadamdan boshlashni aniqlaymiz.\n\n17 yillik mutaxassisdan bepul maslahat.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d21",
  },
  { id: "d21", type: "delay", minutes: 120, next: "m22" },

  // 22 (+2 soat) — 12+ proof recap
  {
    id: "m22", type: "message",
    text: `[ism], sizga 12 dan ortiq shogird hikoyasini ko'rsatdim.\n\nParizoda, Nilufar, Ma'mura, Ra'no, Muslima, Iroda, Dilnoza, Muqaddas, Nazokathon…\n\nHamshira, uy bekasi, talaba edi. Bugun — o'z daromadi. Keyingisi SIZ bo'lasiz.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d22",
  },
  { id: "d22", type: "delay", minutes: 120, next: "m23" },

  // 23 (+2 soat) — urgency 1 (spots filling)
  {
    id: "m23", type: "message",
    text: `[ism], ochiq gaplashaman: keyingi guruh tez orada yopiladi.\n\nKurator har o'quvchini sifatli kuzatishi kerak — shuning uchun o'rin cheklangan. Ulgurmasangiz, keyingi oqim bir necha oydan keyin.`,
    next: "d23",
  },
  { id: "d23", type: "delay", minutes: 180, next: "m24" },

  // 24 (+3 soat) — Muhlisa + Nazokat photo
  {
    id: "m24", type: "message",
    text: `Muhlisa — 0 dan 20 millionga. Nazokat — do'kon sotuvchisi edi, bugun 10 million.\n\nUlar kutmadi — boshladi. Kutgan har oy — yo'qotilgan daromad.`,
    media: { key: "v2_photo_nazokat_muhlisa", kind: "photo" },
    next: "d24",
  },
  { id: "d24", type: "delay", minutes: 120, next: "m24b" },

  // 24b (+2 soat) — money math voice
  {
    id: "m24b", type: "message",
    text: `[ism], ko'p so'raladigan savol: "aslida oyiga qancha bo'ladi?"\n\nHisoblaymiz. Bir seans o'rtacha 150 ming. Kuniga atigi 3 ta — har biri 1.5 soat, oilangizga ham vaqt qoladi. Kuniga 450 ming. Oyiga 9 milliondan oshadi.\n\nBu — sehr emas, oddiy matematika. Va ko'p mijozlar oylik emas, kurs bo'yicha keladi — ya'ni doimiy. Buni qanday qurishni to'liq o'rgataman.`,
    media: { key: "audio_money_math", kind: "voice" },
    next: "d24b",
  },
  { id: "d24b", type: "delay", minutes: 1440, next: "m25" },

  // ── DAY 6 — messages 25–28b ───────────────────────────────────────────────

  // 25 (+1 kun) — knowledge vs path
  {
    id: "m25", type: "message",
    text: `[ism], shu yergacha keldingiz — jiddiysiz.\n\nEndi ichini ko'rsatay. Ko'p odam "kurs oldim" deb o'ylaydi, keyin hech narsa o'zgarmaydi — chunki BILIM oldi, YO'L olmadi.\n\nMen sizga to'liq YO'L beraman.`,
    next: "d25",
  },
  { id: "d25", type: "delay", minutes: 120, next: "m26" },

  // 26 (+2 soat) — modules audio
  {
    id: "m26", type: "message",
    text: `3 modul, 20 dars:\n\n1️⃣ Anatomik diagnostika — muammoni aniqlash, shifokorga yo'naltirish\n2️⃣ Kompleks fizioterapiya — massaj, LFK, elektroforez, parafin\n3️⃣ Kamyob mutaxassislik + marketing — mijoz topish, narx qo'yish, sotish\n\nKursni tugatib — BUTUN KASB egasi bo'lasiz.`,
    media: { key: "v2_audio_modullar", kind: "voice" },
    next: "d26",
  },
  { id: "d26", type: "delay", minutes: 120, next: "m27" },

  // 27 (+2 soat) — bonus stack
  {
    id: "m27", type: "message",
    text: `Va faqat kurs emas:\n\n🎁 Shaxsiy kurator — har vazifani 48 soatda tekshiradi\n🎁 "Birinchi mijozgacha 15 kun" tizimi\n🎁 Tayyor marketing — Instagram reja + 20 shablon + narx qo'yish\n🎁 Professional sertifikat\n🎁 Umrbod hamjamiyat + jonli efirlar`,
    next: "d27",
  },
  { id: "d27", type: "delay", minutes: 180, next: "m28" },

  // 28 (+3 soat) — guarantee + CTA
  {
    id: "m28", type: "message",
    text: `[ism], bir nafasda: butun kasb + kurator + mijoz tizimi + marketing + sertifikat.\n\nVa risk MENDA:\n🛡 14 kun yoqmasa — 100% qaytadi.\n🛡 90 kun mijoz topilmasa — bepul ishlayman.\n\nO'z vaqtimni garovga qo'yaman.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d28",
  },
  { id: "d28", type: "delay", minutes: 120, next: "m28b" },

  // 28b (+2 soat) — first client voice
  {
    id: "m28b", type: "message",
    text: `[ism], eng ko'p qo'rquv: "mijozni qayerdan topaman?"\n\nOchig'ini aytaman — ular allaqachon oldingizdan o'tyapti. Parizoda birinchi mijozini qayerdan topgan bilasizmi? Qo'shnisining bolasidan. Nilufar — bog'chadagi onalardan. Ma'mura — Instagram orqali, bir hafta ichida.\n\nSirr — kutmaslikda, boshlashda. Kursda aynan shu 15 kunlik tizimni beraman: kundan-kunga kim bilan gaplashish, nima yozish. Birinchi mijozgacha aniq yo'l.`,
    media: { key: "v2_audio_birinchi", kind: "voice" },
    next: "d28b",
  },
  { id: "d28b", type: "delay", minutes: 1440, next: "m29" },

  // ── DAY 7 — messages 29–32 ────────────────────────────────────────────────

  // 29 (+1 kun) — three tiers
  {
    id: "m29", type: "message",
    text: `▪️ BAZA — o'z bolam uchun\n▪️ KASB — professional kasb egasi ⭐ (to'liq tizim)\n▪️ BIZNES — o'z markazim (KASB + shaxsiy ish)\n\nQaysi biri sizga mos — qo'ng'iroqda birga tanlaymiz.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d29",
  },
  { id: "d29", type: "delay", minutes: 120, next: "m30" },

  // 30 (+2 soat) — math + Nasiya
  {
    id: "m30", type: "message",
    text: `Hisob: bir seans 150 ming × kuniga 3 = oyiga 9 million+.\n\nKo'p shogird birinchi oydayoq to'lovni qopladi. Uzum Nasiya orqali bo'lib to'lash mumkin — batafsil qo'ng'iroqda.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d30",
  },
  { id: "d30", type: "delay", minutes: 180, next: "m31" },

  // 31 (+3 soat) — selective / serious leads only
  {
    id: "m31", type: "message",
    text: `[ism], ochiq aytaman: men HAMMAGA o'rgatmayman.\n\nMenga jiddiy, natija ko'rsatadigan odam kerak. Qo'ng'iroqda men ham sizni tekshiraman.`,
    next: "d31",
  },
  { id: "d31", type: "delay", minutes: 120, next: "m32" },

  // 32 (+2 soat) — urgency 2
  {
    id: "m32", type: "message",
    text: `[ism], bu oqimda o'rin sanoqli qoldi.\n\nTo'lganda eshik yopiladi. Bu — soxta shoshirish emas: kurator sifatli ishlashi uchun chinakam cheklov.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d32",
  },
  { id: "d32", type: "delay", minutes: 1440, next: "m33" },

  // ── DAY 8 — messages 33–35 ────────────────────────────────────────────────

  // 33 (+1 kun) — social proof momentum
  {
    id: "m33", type: "message",
    text: `Hozir ham ariza qoldirayotganlar bor. Har kuni yangi hamshira bu yo'lga qo'shilyapti.\n\nSiz esa hali o'ylaysizmi? Har o'tgan kun — Parizoda allaqachon bosgan qadam.`,
    next: "d33",
  },
  { id: "d33", type: "delay", minutes: 180, next: "m34" },

  // 34 (+3 soat) — halal angle
  {
    id: "m34", type: "message",
    text: `[ism], bu kasb nafaqat daromad — savob.\n\nHar bola tuzalishiga yordam berganingizda, onaning duosini olasiz. Halol pul, halol duo. Bundan yaxshi kasb bormi?`,
    next: "d34",
  },
  { id: "d34", type: "delay", minutes: 120, next: "m35" },

  // 35 (+2 soat) — soft CTA
  {
    id: "m35", type: "message",
    text: `[ism], bitta qadam qoldi.\n\nBepul, bosimsiz suhbat — sizga qaysi tarif, narx, Nasiya shartlarini aytaman. Hech narsa olmasangiz ham — bepul yo'l-xarita.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d35",
  },
  { id: "d35", type: "delay", minutes: 1440, next: "m36" },

  // ── DAY 9 — messages 36–38 ────────────────────────────────────────────────

  // 36 (+1 kun) — two roads
  {
    id: "m36", type: "message",
    text: `[ism], ikki yo'l:\n\nBu xabarni yopib, ertaga o'sha 3 millionga qaytish — yoki bir gaplashib, bir yildan keyin "hayotim shundan o'zgargan" deyish.\n\nParizoda ikkinchisini tanladi.`,
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d36",
  },
  { id: "d36", type: "delay", minutes: 180, next: "m37" },

  // 37 (+3 soat) — urgency 3 video
  {
    id: "m37", type: "message",
    text: `[ism], ochiq: guruh to'lyapti.\n\nAgar bu oqimni o'tkazib yuborsangiz — keyingisi oylar keyin, va narx ham o'zgarishi mumkin. Hozir gaplashsak, eng yaxshi shartlarni beraman.`,
    media: { key: "v2_video_final", kind: "video" },
    urlButtons: [{ text: "📞 Hoziroq yozilish", url: ADMIN }],
    next: "d37",
  },
  { id: "d37", type: "delay", minutes: 180, next: "m38" },

  // 38 (+3 soat) — Ra'no photo
  {
    id: "m38", type: "message",
    text: `[ism], Ra'no 55 yoshda qo'rqqan, boshlagan — bugun 15 million.\n\nYosh emas, qaror muhim. Sizning navbatingiz. Bugun bir qaror — bir yildan keyin boshqa hayot.`,
    media: { key: "v2_photo_rano", kind: "photo" },
    urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }],
    next: "d38",
  },
  { id: "d38", type: "delay", minutes: 1440, next: "m39" },

  // ── DAY 10–11 — messages 39–40 ───────────────────────────────────────────

  // 39 (+1 kun) — anti-fraud notice
  {
    id: "m39", type: "message",
    text: `⚠️ Eslatma: to'lov faqat rasmiy kanal orqali.\n\nFiribgarlar nomimizdan yozishi mumkin — begona kartaga to'lov qilmang. Faqat @shahnoza_soliyeva_admin1.`,
    next: "d39",
  },
  { id: "d39", type: "delay", minutes: 1440, next: "m40" },

  // 40 (+1 kun) — soft close / retarget
  {
    id: "m40", type: "message",
    text: `[ism], balki hozir vaqti emas — mayli.\n\nBepul dars va yo'l-xarita sizniki. Tayyor bo'lganingizda shu yerga yozing. Sizni kutamiz. Omad! 🌿`,
    urlButtons: [{ text: "📞 Tayyor bo'ldim, yozaman", url: ADMIN }],
    next: "m_end",
  },

  // terminal
  { id: "m_end", type: "end", status: "nurtured" },
];

const BY_ID: Record<string, FlowStep> = Object.fromEntries(FLOW.map((s) => [s.id, s]));
export function getStep(id: string): FlowStep | undefined {
  return BY_ID[id];
}
export const ENTRY_STEP = "m1";
