/**
 * Shahnoza lead-magnet funnel — 40 messages, full AUTO-SEND drip.
 *
 * Media slots (photo/voice/video) are filled via the dashboard Bot → Media panel.
 * Until filled the bot sends the step text only, so the funnel runs immediately.
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

  // 1 — /START [PHOTO + BUTTON] +0 min
  {
    id: "m1", type: "message",
    text: `Salom, [ism]! 🌿\n\nSizga va'da qilgan bepul darsni hozir yuboryapman.\n\nBu darsda aniq ko'rasiz:\n- Nega hamshiralar 2 mln dan oshmaydi\n- Qanday qilib kuniga 2 soat ishlab 10 mln topish mumkin\n- Parizoda 6 oyda uyiga boshlang'ich to'lovni qanday qildi\n\nEng muhim qismi oxirida.\nHozir ko'ring 👇`,
    media: { key: "v2_photo_shahnoza", kind: "photo" },
    urlButtons: [{ text: "🎥 Bepul Darsni Ko'rish", url: "" }],
    next: "d1",
  },
  { id: "d1", type: "delay", minutes: 5, next: "m2" },

  // 2 — KANAL [VIDEO + BUTTON] +5 min
  {
    id: "m2", type: "message",
    text: "",
    media: { key: "v2_video_dars", kind: "video" },
    urlButtons: [{ text: "📢 KANALGA QO'SHILISH — bepul", url: "" }],
    next: "d2",
  },
  { id: "d2", type: "delay", minutes: 30, next: "m3" },

  // 3 — DARSGA UNDASH [TEXT] +30 min
  {
    id: "m3", type: "message",
    text: `[ism], darsni boshladingizmi?\n\nOxirigacha ko'ring.\nAynan oxirida 20 kunda birinchi mijozni topish sirini aytganman.\n\nKo'p hamshiralar shu joyda:\n"Shunchalik oddiy ekan-a…" deyishadi.`,
    next: "d3",
  },
  { id: "d3", type: "delay", minutes: 120, next: "m4" },

  // 4 — POLL [TEXT] +2 soat
  {
    id: "m4", type: "message",
    text: `[ism], bitta savol.\n\nHozir sizni eng ko'p nima to'xtatib turibdi?\n\nRaqamni yozing 👇\n\n1️⃣ Daromadim yetmaydi\n2️⃣ Ishim bor, lekin pul yetarli emas\n3️⃣ Uydan chiqolmayman\n4️⃣ "Uddalarmikanman" degan qo'rquv\n\nYozing, o'qiyman.`,
    next: "d4",
  },
  { id: "d4", type: "delay", minutes: 60, next: "m5" },

  // 5 — ORIGIN [VOICE] +1 soat
  {
    id: "m5", type: "message",
    text: "",
    media: { key: "v2_audio_origin", kind: "voice" },
    next: "d5",
  },
  { id: "d5", type: "delay", minutes: 120, next: "m6" },

  // 6 — TIZIM XATOSI [VOICE] +2 soat
  {
    id: "m6", type: "message",
    text: "",
    media: { key: "v2_audio_tizim", kind: "voice" },
    next: "d6",
  },
  { id: "d6", type: "delay", minutes: 180, next: "m7" },

  // 7 — PARIZODA [PHOTO] +3 soat
  {
    id: "m7", type: "message",
    text: `Bu — Parizoda.\nBir yil oldin poliklinikada 2-3 mln ga ishlagan oddiy hamshira.\n\nBugun:\n- Oyiga 10 mln+ topadi\n- O'z uyiga boshlang'ich to'lov qildi\n- Bolasi yonida ishlaydi\n\nU maxsus odam emas edi.\nShunchaki tizimni o'zgartirdi.`,
    media: { key: "v2_photo_parizoda", kind: "photo" },
    next: "d7",
  },
  { id: "d7", type: "delay", minutes: 120, next: "m8" },

  // 8 — MEXANIZM [TEXT] +2 soat
  {
    id: "m8", type: "message",
    text: `Qanday qilib 10 mln chiqadi?\n\n1 ta bola 10 kunlik kurs = 1 500 000 so'm\nOyiga 6-7 ta bola = 10 000 000 so'm\n\nKuniga atigi 2 soat.\nReklama shart emas.\n\nBu — oddiy matematika.`,
    next: "d8",
  },
  { id: "d8", type: "delay", minutes: 60, next: "m9" },

  // 9 — PUNCH [TEXT] +1 soat
  {
    id: "m9", type: "message",
    text: `[ism], ochiq gaplashaylik.\n\nBu 6-7 ta mijozni topish uchun Instagram yoki qimmat reklama kerak emas.\n\nUlar hozir atrofingizda:\nqo'shni bolasi, qarindoshning nevarasi, bog'cha onalari…\n\nSiz ularni ko'rasiz.\nLekin ular sizga to'lamaydi.\n\nNega?\nChunki siz "hamshiraman" deysiz.\nUlarga esa PROFI kerak.`,
    next: "d9",
  },
  { id: "d9", type: "delay", minutes: 240, next: "m10" },

  // 10 — ANTICIPATION [TEXT] +4 soat
  {
    id: "m10", type: "message",
    text: `Bugun muhim narsa yuboraman 🔔\n\nShogirdlarimdan biri reklamasiz birinchi mijozini qanday topganini ko'rsataman.\n\nTayyor bo'lsangiz, 🔥 reaksiya qoldiring.\nReaksiya qoldirganlar maxsus material oladi.`,
    next: "d10",
  },
  { id: "d10", type: "delay", minutes: 1440, next: "m11a" },

  // 11a — NILUFAR [PHOTO] +1 kun
  {
    id: "m11a", type: "message",
    text: `Nilufar bog'cha hamshirasi edi.\nKo'p kurs o'qigan, lekin amaliyotda yolg'iz qolgan.\n\nBirinchi mijozini bog'chadagi onalar orasidan topdi.\n\nBugun:\n- Oyiga $2000 atrofida topadi\n- Bog'chaning o'zida markaz ochgan`,
    media: { key: "v2_photo_nilufar", kind: "photo" },
    next: "d11a",
  },
  { id: "d11a", type: "delay", minutes: 30, next: "m11b" },

  // 11b — 5-STEP [TEXT] +30 min
  {
    id: "m11b", type: "message",
    text: `Nilufar qanday qildi?\n5 oddiy qadam:\n\n1️⃣ Atrofdagi ehtiyojni ko'rish\n(bolada bo'yin qiyshiqligi yoki oyoq uchini ichkariga burish)\n\n2️⃣ Ona bilan yumshoq gapirish\n("Bepul qarab beray, xavotir olmang")\n\n3️⃣ Bepul diagnostika qilish\n\n4️⃣ 10 kunlik kursni taklif qilish\n\n5️⃣ Natija ko'rgan ona o'zi boshqalarni olib keladi\n\nShu 5 qadam bilan u 2 mln oylikdan chiqdi.`,
    next: "d11b",
  },
  { id: "d11b", type: "delay", minutes: 360, next: "m12" },

  // 12 — MAMURA [PHOTO] +6 soat
  {
    id: "m12", type: "message",
    text: `Ma'mura eridan uzoqda, 2 bola bilan yolg'iz qolgan edi.\nDepressiyaga tushgan.\n\nMassajni o'rgandi.\nHozir oyiga 15 mln topadi va o'z markazini ochgan.\n\nU ham avval "men uddalaymanmi?" deb o'ylagan.`,
    media: { key: "v2_photo_mamura", kind: "photo" },
    next: "d12",
  },
  { id: "d12", type: "delay", minutes: 180, next: "m13" },

  // 13 — TAJRIBA [TEXT] +3 soat
  {
    id: "m13", type: "message",
    text: `"Tajribam yo'q-ku…"\n\nTushunaman.\n\n👵 Ra'no opa 55 yoshda 0 dan boshladi → hozir 15 mln\n👧 Muslima 18 yoshda boshladi → hozir 10 mln\n\nSizda ulardan katta ustunlik bor — tibbiy bilim.\nFaqat qo'lingizni massajga moslashtirasiz.`,
    next: "d13",
  },
  { id: "d13", type: "delay", minutes: 240, next: "m14" },

  // 14 — FUTURE PACE [VOICE] +4 soat
  {
    id: "m14", type: "message",
    text: "",
    media: { key: "v2_audio_future", kind: "voice" },
    next: "d14",
  },
  { id: "d14", type: "delay", minutes: 15, next: "m15" },

  // 15 — COMMITMENT [TEXT] +15 min
  {
    id: "m15", type: "message",
    text: `Bu xayol emas.\nBu Parizoda, Nilufar va Ma'muraning hozirgi hayoti.\n\nUlar bitta narsani qilishgan — qaror.\n\nAgar siz ham tayyor bo'lsangiz,\npastda "TAYYORMAN" deb yozing.`,
    next: "d15",
  },
  { id: "d15", type: "delay", minutes: 180, next: "m16" },

  // 16 — IRODA + MUHLISA [PHOTO] +3 soat
  {
    id: "m16", type: "message",
    text: `Iroda — kichik bolali, uydan chiqa olmasdi.\nHozir uydan 20 mln gacha topadi.\n\nMuhlisahon — oilasi qiyin ahvolda edi.\nHozir 10 mln topadi, oilasi tiklandi.`,
    media: { key: "v2_photo_iroda_muhlisa", kind: "photo" },
    next: "d16",
  },
  { id: "d16", type: "delay", minutes: 1440, next: "m17" },

  // 17 — VAQT [TEXT] +1 kun
  {
    id: "m17", type: "message",
    text: `"Vaqtim yo'q…"\n\nMen ham shunday edim.\n\nShuning uchun darslarni 15-20 daqiqalik qildim.\nTelefonda, bola uxlaganda ko'rasiz.\n\nBu kasb vaqtingizni tortib olmaydi —\naksincha oilaga ko'proq vaqt beradi.`,
    next: "d17",
  },
  { id: "d17", type: "delay", minutes: 180, next: "m18" },

  // 18 — ER E'TIROZI [TEXT] +3 soat
  {
    id: "m18", type: "message",
    text: `"Shahnoza opa, erim ruxsat bermaydi…"\n\n[ism], bu juda tabiiy.\nErkak kishi oilani himoya qilishni xohlaydi.\n\nHozir 10 mln topayotgan shogirdlarimning ko'pining erlari ham boshida qarshi bo'lishgan.\n\nUlar qarshi emas — shunchaki sizni aldanib qolishingizdan qo'rqishadi.\n\nNima qilish kerak?\nUrishmang. Shunchaki ayting:\n\n"Uyda o'tirib, bolalarimiz yonida halol kasb o'rganmoqchiman. Begona joyga qatnamayman."\n\nXohlasangiz, bepul suhbatga eringiz bilan birga keling.\nSavollariga o'zim javob beraman.`,
    next: "d18",
  },
  { id: "d18", type: "delay", minutes: 180, next: "m19" },

  // 19 — ONLINE [TEXT] +3 soat
  {
    id: "m19", type: "message",
    text: `"Online o'rgana olamanmi?"\n\nOffline o'qisangiz ham birinchi massaj mukammal bo'lmaydi.\n\nShuning uchun kuratorlar bor.\nAmaliyotingizni videoga olib yuborasiz —\nxatolaringizni birga to'g'rilaymiz.\n\nYoningizda o'tirgandek bo'ladi.`,
    next: "d19",
  },
  { id: "d19", type: "delay", minutes: 120, next: "m20" },

  // 20 — PUL [PHOTO] +2 soat
  {
    id: "m20", type: "message",
    text: `"Pulim yetmaydi…"\n\nUzum Nasiya orqali oylik to'lov 150-200 ming so'mga tushadi.\n\n1 ta mijozning o'zi bu pulni qoplaydi.\n\nOshpazlar va farroshlar ham natija qilishgan.\nSizda tibbiy asos bor.`,
    media: { key: "v2_photo_dilnoza_muqaddas", kind: "photo" },
    next: "d20",
  },
  { id: "d20", type: "delay", minutes: 1440, next: "m21" },

  // 21 — AKT 2 KIRISH [TEXT + BUTTON] +1 kun
  {
    id: "m21", type: "message",
    text: `[ism], endi ochiq aytaman.\n\nKo'p ayollar kurs oladi, video ko'radi…\n1 oydan keyin natija nol.\n\nChunki ularga tizim berilmagan.\n\nMen sizga aniq yo'lni beraman.\nSizning holatingizdan kelib chiqib, qancha topishingiz mumkinligini birga ko'ramiz.\n\n15 daqiqalik bepul tahlilga yoziling 👇`,
    urlButtons: [{ text: "📞 Bepul Tahlilga Yozilish", url: ADMIN }],
    next: "d21",
  },
  { id: "d21", type: "delay", minutes: 120, next: "m22" },

  // 22 — PROOF RECAP [TEXT] +2 soat
  {
    id: "m22", type: "message",
    text: `Parizoda kechasi yig'lagan.\nMa'mura yolg'iz qolgan.\nRa'no opa 55 yoshda ikkilangan.\n\nUlar ham xuddi hozir siz turgan joyda edilar.\nBitta qaror hayotlarini o'zgartirdi.`,
    next: "d22",
  },
  { id: "d22", type: "delay", minutes: 120, next: "m23" },

  // 23 — URGENCY [TEXT] +2 soat
  {
    id: "m23", type: "message",
    text: `Yangi guruhga qabul ochildi.\n\nFaqat 30 ta joy.\nAmaliyot sifatli bo'lishi uchun ko'proq olmaymiz.\n\n48 soat ichida yozilsangiz:\n- Bonuslar ochiladi\n- Imtiyozli shartlar saqlanadi\n- Joy kafolatlanadi`,
    next: "d23",
  },
  { id: "d23", type: "delay", minutes: 180, next: "m24" },

  // 24 — NAZOKAT + MUHLISA [PHOTO] +3 soat
  {
    id: "m24", type: "message",
    text: `Nazokathon 19 yoshda 0 dan boshladi → hozir 20 mln.\nMuhlisa farrosh edi → hozir 20 mln.\n\nUlar "qulay vaqt" kutishmagan.`,
    media: { key: "v2_photo_nazokat_muhlisa", kind: "photo" },
    next: "d24",
  },
  { id: "d24", type: "delay", minutes: 120, next: "m24b" },

  // 24b — HISOB [TEXT] +2 soat
  {
    id: "m24b", type: "message",
    text: `1 ta bola 10 kun = 1 500 000 so'm\n2 ta doimiy mijoz = oyiga 9 mln atrofida\n\nKuniga 2 soat.\nPoliklinika smenasiz.`,
    next: "d24b",
  },
  { id: "d24b", type: "delay", minutes: 1440, next: "m25" },

  // 25 — TIZIM + MICRO [TEXT] +1 kun
  {
    id: "m25", type: "message",
    text: `Men sizga shunchaki kurs emas — umrlik kasb beraman.\n\nTugatgach sizda bo'ladi:\n- Birinchi to'laydigan mijoz\n- Birinchi halol daromad\n- Professional sertifikat\n- Tayyor marketing materiallari\n\nAgar rejani ko'rishni xohlasangiz,\n"HA" deb yozing.`,
    next: "d25",
  },
  { id: "d25", type: "delay", minutes: 120, next: "m26" },

  // 26 — MODULLAR [VOICE] +2 soat
  {
    id: "m26", type: "message",
    text: "",
    media: { key: "v2_audio_modullar", kind: "voice" },
    next: "d26",
  },
  { id: "d26", type: "delay", minutes: 120, next: "m27" },

  // 27 — BONUS STACK [TEXT] +2 soat
  {
    id: "m27", type: "message",
    text: `Suhbatdan o'tib qo'shilsangiz olasiz:\n\n🎁 15 kunlik birinchi mijoz tizimi\n🎁 30 kunlik Instagram rejasi + 20 ta Canva\n🎁 5 daqiqalik narx kalkulyatori\n🎁 Shaxsiy kurator + 1:1 video tahlil\n🎁 Professional sertifikat\n🎁 Xavfsizlik moduli\n🎁 Umrbod community\n\n5 kun ichida to'liq to'lov qilsangiz — qo'shimcha maxsus bonuslar ham ochiladi\n(5/10/20 mln yo'llari + Target va Mobilografiya).`,
    next: "d27",
  },
  { id: "d27", type: "delay", minutes: 180, next: "m28" },

  // 28 — KAFOLAT [TEXT] +3 soat
  {
    id: "m28", type: "message",
    text: `Barcha riskni men olaman.\n\n1. 7 kunlik kafolat — yoqmasa pul 100% qaytariladi\n2. 90 kunlik natija kafolati — vazifalarni bajarsangiz, mijoz topmaguncha bepul ishlayman`,
    next: "d28",
  },
  { id: "d28", type: "delay", minutes: 120, next: "m28b" },

  // 28b — BIRINCHI MIJOZ [VOICE] +2 soat
  {
    id: "m28b", type: "message",
    text: "",
    media: { key: "v2_audio_birinchi", kind: "voice" },
    next: "d28b",
  },
  { id: "d28b", type: "delay", minutes: 1440, next: "m29" },

  // 29 — TARIFLAR [TEXT + BUTTON] +1 kun
  {
    id: "m29", type: "message",
    text: `3 yo'nalish bor:\n\n🍼 Baza — o'z farzandingiz uchun\n⭐ Kasb — uydan 10-15 mln (eng ko'p tanlanadi) + barcha bonuslar\n🏢 Biznes — o'z markazingizni ochish\n\nQaysi biri sizga mosligini birga aniqlaymiz 👇`,
    urlButtons: [{ text: "📞 O'zimga Mos Tarifni Tanlash", url: ADMIN }],
    next: "d29",
  },
  { id: "d29", type: "delay", minutes: 120, next: "m30" },

  // 30 — PAYBACK [TEXT] +2 soat
  {
    id: "m30", type: "message",
    text: `Uzum Nasiya bilan oylik to'lov 150-200 ming.\n\n1 ta seansning o'zi oylik to'lovni yopadi.\nQolgani — sizniki.`,
    next: "d30",
  },
  { id: "d30", type: "delay", minutes: 180, next: "m31" },

  // 31 — VETTING [TEXT] +3 soat
  {
    id: "m31", type: "message",
    text: `Men har kimni olmayman.\n\nFaqat hayotini o'zgartirishga chinakam tayyor ayollar bilan ishlayman.\n\nSuhbatda birga ko'ramiz — bu yo'l sizga mosmi yoki yo'q.`,
    next: "d31",
  },
  { id: "d31", type: "delay", minutes: 120, next: "m32" },

  // 32 — SCARCITY [TEXT + BUTTON] +2 soat
  {
    id: "m32", type: "message",
    text: `Joylar cheklangan.\nBir vaqtda faqat 30 ta odam.\n\nHozir yarmi band.\nTo'lgach qabul yopiladi.\n\nHali ulgurganingizda yoziling 👇`,
    urlButtons: [{ text: "📞 Joy Band Qilish", url: ADMIN }],
    next: "d32",
  },
  { id: "d32", type: "delay", minutes: 1440, next: "m33" },

  // 33 — FAQ [TEXT] +1 kun
  {
    id: "m33", type: "message",
    text: `❓ Tajriba yo'q — eplaymanmi?\nHa. 55 yoshda 0 dan boshlaganlar bor.\n\n❓ Online xato qilsam?\nKurator videoda to'g'rilaydi.\n\n❓ Vaqt kam?\nDarslar 15-20 daqiqa.\n\n❓ Narx?\nSuhbatda holatingizga qarab aniqlaymiz.`,
    next: "d33",
  },
  { id: "d33", type: "delay", minutes: 180, next: "m34" },

  // 34 — HALOL DUO [TEXT] +3 soat
  {
    id: "m34", type: "message",
    text: `Bu shunchaki pul emas.\n\nBitta bolaning oyog'i to'g'rilanib,\nbirinchi marta qadam tashlagandagi onaning duosi…\n\nBunga hech narsa yetmaydi.\n\nHalol pul.\nHalol duo.`,
    next: "d34",
  },
  { id: "d34", type: "delay", minutes: 120, next: "m35" },

  // 35 — CTA [TEXT + BUTTON] +2 soat
  {
    id: "m35", type: "message",
    text: `Orzu va real daromad orasida bitta qadam qoldi.\n\n15 daqiqalik bepul suhbatda:\n- Holatingizni tahlil qilamiz\n- Qaysi tarif mosligini ko'ramiz\n- 10 mln ga chiqish rejasini tuzamiz`,
    urlButtons: [{ text: "📞 Bepul Suhbatga Yozilish", url: ADMIN }],
    next: "d35",
  },
  { id: "d35", type: "delay", minutes: 1440, next: "m36" },

  // 36 — TWO ROADS [TEXT + BUTTON] +1 kun
  {
    id: "m36", type: "message",
    text: `2 ta yo'l bor:\n\n1. Bu xabarni yopasiz → ertaga yana 2 mln smenaga qaytasiz\n2. Tugmani bosasiz → 1 yildan keyin "o'sha kun hayotim o'zgardi" deysiz\n\nParizoda 2-chisini tanladi.\nSiz?`,
    urlButtons: [{ text: "📞 Bepul Suhbatga Yozilish", url: ADMIN }],
    next: "d36",
  },
  { id: "d36", type: "delay", minutes: 180, next: "m37" },

  // 37 — FINAL URGENCY [VIDEO + BUTTON] +3 soat
  {
    id: "m37", type: "message",
    text: "",
    media: { key: "v2_video_final", kind: "video" },
    urlButtons: [{ text: "📞 Hoziroq Yozilish", url: ADMIN }],
    next: "d37",
  },
  { id: "d37", type: "delay", minutes: 180, next: "m38" },

  // 38 — RANO [PHOTO + BUTTON] +3 soat
  {
    id: "m38", type: "message",
    text: `Ra'no opa 55 yoshda 0 dan boshladi.\nHozir oyiga 15 mln topadi.\n\nYosh bahona emas.\nQaror muhim.`,
    media: { key: "v2_photo_rano", kind: "photo" },
    urlButtons: [{ text: "📞 Bepul Suhbatga Yozilish", url: ADMIN }],
    next: "d38",
  },
  { id: "d38", type: "delay", minutes: 1440, next: "m39" },

  // 39 — XAVFSIZLIK [TEXT] +1 kun
  {
    id: "m39", type: "message",
    text: `⚠️ Faqat rasmiy admin bilan gaplashing.\n\nBegona akkauntlarga pul o'tkazmang.\nFiribgarlar nomimizdan yozishi mumkin.\n\nFaqat: @shahnoza_soliyeva_admin1`,
    next: "d39",
  },
  { id: "d39", type: "delay", minutes: 1440, next: "m40" },

  // 40 — ESHIK OCHIQ [TEXT + BUTTON] +1 kun
  {
    id: "m40", type: "message",
    text: `Balki hozir vaqt emas.\nTushunaman.\n\nMateriallar sizda qoladi.\nTayyor bo'lganingizda yozing — men shu yerdaman 🌿`,
    urlButtons: [{ text: "📞 Tayyor bo'lganimda yozaman", url: ADMIN }],
    next: "m_end",
  },

  { id: "m_end", type: "end", status: "nurtured" },
];

const BY_ID: Record<string, FlowStep> = Object.fromEntries(FLOW.map((s) => [s.id, s]));
export function getStep(id: string): FlowStep | undefined {
  return BY_ID[id];
}
export const ENTRY_STEP = "m1";
