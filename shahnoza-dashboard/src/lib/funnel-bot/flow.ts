/**
 * The Shahnoza lead-magnet funnel — 40 messages, AUTO-SEND timed drip.
 *
 * Design (per the master script):
 *   • Every message auto-sends on a timer — no "continue" taps, no branching.
 *   • The ONLY buttons are outbound links: the free lesson, the channel, and the
 *     call/DM to the admin (@shahnoza_soliyeva_admin1). Buttons never advance the
 *     flow — the timer does.
 *   • The bot NEVER asks for a phone. Leads come from channel joins, admin DMs,
 *     and any reply (a reply stops the drip and hands the person to a human).
 *
 * Media (photos/voice/video) are SLOTS with stable keys — empty for now. Fill
 * MEDIA below or from the dashboard (Telegram file_id or a public URL) and the
 * bot sends them; until then each step sends its text (so the funnel runs today).
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

/** The admin the "book a call" buttons open. */
const ADMIN = "https://t.me/shahnoza_soliyeva_admin1";

/** Fill these when you have the media (Telegram file_id after first upload, or a
 *  public URL). Leave a key out and the bot just sends that step's text. */
export const MEDIA: Record<string, { fileId?: string; url?: string }> = {
  // vsl_short_thumb: { url: "https://..." },
  // shahnoza_welcome_vid: { fileId: "BAAC..." },
};

export const FLOW_KEY = "lead_magnet_v1";

// Timers (minutes): 1 min = 1 · 1 soat = 60 · 1 kun = 1440 · 2 kun = 2880.
export const FLOW: FlowStep[] = [
  // 1 · delivery + lesson button (t+0)
  {
    id: "m1",
    type: "message",
    text: `Assalomu alaykum, [ism]! 🌿\nSizga "Hamshiralikdan halol daromadga" bepul darsini yuboryapman 💰\n45 daqiqaga jamlangan to'liq yo'l xaritasi:\n❤️ nega maoshingiz 3 millionda qotib qolgan\n🔍 mijozni qayerdan topish\n🧩 vaqt emas, natija sotish modeli\n🚀 tajriba/blog/pul — shart emas\n🗓 birinchi mijozgacha aniq qadamlar\nDarsni ko'ring 👇`,
    media: { key: "vsl_short_thumb", kind: "photo" },
    urlButtons: [{ text: "🎥 Bepul darsni ko'rish", url: "" }],
    next: "w2",
  },
  { id: "w2", type: "delay", minutes: 5, next: "m2" },

  // 2 · welcome + channel button (+5 min)
  {
    id: "m2",
    type: "message",
    text: `Mana, siz shu yerdasiz 🚀\nSizni tabriklayman, [ism] — eng to'g'ri vaqtda, eng to'g'ri joyda turibsiz. Eng birinchilar orasidasiz.\nMen — Shahnoza Soliyeva, oliy toifali hamshira, 17 yillik tajriba. So'nggi yilda 14 nafar oddiy hamshirani — sizga o'xshagan ayollarni — o'z daromadiga olib chiqdim. Parizoda 10 million, Nilufar 20 million, Iroda 20 million…\nEndi eng muhimi 👇\nMen maxsus kanal ochdim — u yerda har kuni:\n✅ Real shogirdlarim natijalari (o'z ovozi, o'z yuzi bilan)\n✅ Bepul mini-darslar — boshqa hech qayerda yo'q\n✅ Bu oqimga kim qo'shilayotgani, nechta o'rin qolgani\n✅ Va eng qimmatli: mening 10 millionlik shogirdim yo'lini to'liq bosqichma-bosqich\nBu kanal — sizning yangi hayotingiz boshlanadigan joy. Bepul darsni ko'rgach, ALBATTA qo'shiling — chunki eng muhim narsalarni o'sha yerda beraman.\nPastdagi tugmani bosing 👇`,
    media: { key: "shahnoza_welcome_vid", kind: "video" },
    urlButtons: [{ text: "📢 KANALGA QO'SHILISH — bepul", url: "" }],
    next: "w3",
  },
  { id: "w3", type: "delay", minutes: 30, next: "m3" },

  // 3 · nudge to watch (+30 min)
  { id: "m3", type: "message", text: `[ism], darsni ochdingizmi? Iltimos, oxirigacha ko'ring — eng muhim qism (Parizoda birinchi mijozini qanday topgani) aynan oxirida. Ko'pchilik shu daqiqada "men ham qila olarkanman" deb tushunadi.`, next: "w4" },
  { id: "w4", type: "delay", minutes: 120, next: "m4" },

  // 4 · reply-bait: objection + city (+2 soat)
  { id: "m4", type: "message", text: `[ism], ayting-chi — hozir sizni nima ko'proq to'xtatyapti? Pastga yozing: tajribami, vaqtmi, pulmi, ishonchmi? O'qib, javob beraman. Va shahringizni ham yozing 🙂`, next: "w5" },
  { id: "w5", type: "delay", minutes: 60, next: "m5" },

  // 5 · origin voice 1 (+1 soat)
  { id: "m5", type: "message", text: `[ism], o'zim haqimda ochig'ini aytay. 2011-yil, oddiy hamshira, 1 million 700 ming. Bir kuni oy oxirida qo'limda pul qolmagan, bolamga kerakli narsani ololmaganman. O'sha kuni yig'laganman.`, media: { key: "origin_voice_1", kind: "voice" }, next: "w6" },
  { id: "w6", type: "delay", minutes: 1, next: "m6" },

  // 6 · origin voice 2 (+1 min)
  { id: "m6", type: "message", text: `"Shuncha o'qidim, oliy toifali hamshiraman — nega ahvolim shu?" derdim. O'shanda tushundim: ayb menda emas — TIZIMDA. Poliklinika vaqtingizni arzon sotib oladi, bilimingizni emas. Men o'sha kuni qaror qildim: chiqaman. Va chiqdim. Sizni ham chiqaraman.`, media: { key: "origin_voice_2", kind: "voice" }, next: "w7" },
  { id: "w7", type: "delay", minutes: 240, next: "m7" },

  // 7 · Parizoda (+4 soat)
  { id: "m7", type: "message", text: `Parizoda ham shu yerda edi — hamshira, 3 million, ijarada. Bir yilda oyiga 10 million, o'z uyi. Farqi yo'q edi — yo'lni topdi.`, media: { key: "parizoda_photo", kind: "photo" }, next: "w8" },
  { id: "w8", type: "delay", minutes: 180, next: "m8" },

  // 8 · the mechanism (+3 soat)
  { id: "m8", type: "message", text: `[ism], Parizoda omad topmadi — TIZIMNI topdi. Poliklinikada VAQTINGIZNI sotasiz — kuniga 24 soat, tamom. Mutaxassis NATIJASINI sotadi. Bir seans 150 ming: ona farzandi tuzalishiga yordam bergani uchun to'laydi, soatingizga emas. Shu qo'l, shu bilim — biri 3, biri 10 million. Farq MODELDA.`, media: { key: "mexanizm_video", kind: "video" }, next: "w9" },
  { id: "w9", type: "delay", minutes: 1, next: "m9" },

  // 9 · it's learnable (+1 min)
  { id: "m9", type: "message", text: `Va bu model o'rganiladi. Men uni 14 hamshiraga o'rgatdim. Ular ham xuddi sizdek boshlagan. Endi navbat sizda.`, next: "w10" },
  { id: "w10", type: "delay", minutes: 1440, next: "m10" },

  // 10 · Nilufar (+1 kun)
  { id: "m10", type: "message", text: `Nilufar — bog'cha hamshirasi, savollari javobsiz qolardi. Bugun o'z markazi, 20 million. Yolg'iz qolmadi — kurator har qadamda.`, media: { key: "nilufar_media", kind: "video" }, next: "w11" },
  { id: "w11", type: "delay", minutes: 240, next: "m11" },

  // 11 · Ma'mura (+4 soat)
  { id: "m11", type: "message", text: `Ma'mura — eri xorijda, depressiyada, 0 daromad. Bugun o'z markazi, 15 million. Holati emas — yo'li o'zgardi.`, media: { key: "mamura_photo", kind: "photo" }, next: "w12" },
  { id: "w12", type: "delay", minutes: 360, next: "m12" },

  // 12 · no experience (+6 soat)
  { id: "m12", type: "message", text: `"Tajribam yo'q"? Ra'no 55 yoshda 0 dan 15 millionga. Muslima 18 yoshda 0 dan 10 millionga. Sizda tibbiy poydevor bor — yarim yo'ldan boshlaysiz.`, next: "w13" },
  { id: "w13", type: "delay", minutes: 1440, next: "m13" },

  // 13 · future pacing voice (+1 kun)
  { id: "m13", type: "message", text: `[ism], ko'zingizni yuming. 90 kundan keyingi ertalab. Budilnik yo'q. Bolangizni o'zingiz uyg'otasiz. Telefonga: "Opa, farzandimni seansga yozsam?" — sizning mijozingiz. Oy oxirida uyga o'z pulingizni kiritasiz, erdan so'ramasdan. Bolangiz "onam mutaxassis" deb faxrlanadi.`, media: { key: "futurepace_voice", kind: "voice" }, next: "w14" },
  { id: "w14", type: "delay", minutes: 1, next: "m14" },

  // 14 · not a dream (+1 min)
  { id: "m14", type: "message", text: `Bu xayol emas, [ism]. Parizoda, Nilufar, Ma'mura shu hayotni yashayapti. Sizdan farqi — ular bir yil oldin QAROR qildi.`, next: "w15" },
  { id: "w15", type: "delay", minutes: 360, next: "m15" },

  // 15 · Iroda + Muhlisahon (+6 soat)
  { id: "m15", type: "message", text: `Iroda — 0 daromad, bolalari kichik. Bugun uydan chiqmay 20 million. Muhlisahon — oilasi buzilish arafasida edi, bugun 10 million, oilasini saqladi.`, media: { key: "iroda_muhlisahon_photo", kind: "photo" }, next: "w16" },
  { id: "w16", type: "delay", minutes: 1440, next: "m16" },

  // 16 · no time (+1 kun)
  { id: "m16", type: "message", text: `"Vaqtim yo'q"? Har dars 15-20 daqiqa, telefonda, bola uxlaganda. Bu kasb vaqtni oiladan olmaydi — uyda, bola yonida ishlaysiz.`, next: "w17" },
  { id: "w17", type: "delay", minutes: 240, next: "m17" },

  // 17 · husband's permission (+4 soat)
  { id: "m17", type: "message", text: `"Erim ruxsat bermasa?" Bu kasb oiladan uzoqlashtirmaydi — uyda ishlaysiz. Ko'p eri boshda ikkilangan, keyin eng katta tarafdori bo'lgan. Xohlasangiz, qo'ng'iroqqa eringiz bilan chiqing.`, next: "w18" },
  { id: "w18", type: "delay", minutes: 1440, next: "m18" },

  // 18 · Dilnoza + Muqaddas (+1 kun)
  { id: "m18", type: "message", text: `Dilnoza — 500 ming edi, bugun bosh master, 15 million. Muqaddas — maktab oshpazi edi, bugun 20 million. Har xil hayot, bir xil natija — tizim bir.`, media: { key: "dilnoza_muqaddas_photo", kind: "photo" }, next: "w19" },
  { id: "w19", type: "delay", minutes: 360, next: "m19" },

  // 19 · money + halal (+6 soat)
  { id: "m19", type: "message", text: `"Pulim yetmasa?" — bo'lib to'lash bor, ko'p shogird birinchi mijozidan qopladi. "Halolmi?" — ha: bola sog'lig'iga xizmat, ona duosi, halol pul.`, next: "w20" },
  { id: "w20", type: "delay", minutes: 1440, next: "m20" },

  // 20 · Nazokathon + Nigora voice (+1 kun)
  { id: "m20", type: "message", text: `Nazokathon — 19 yoshli talaba, 0 dan 20 millionga, oliygohni o'zi to'laydi. Nigora — 500 mingdan 15 millionga. Yosh, tajriba — to'siq emas.`, media: { key: "nazokathon_voice", kind: "voice" }, next: "w21" },
  { id: "w21", type: "delay", minutes: 240, next: "m21" },

  // 21 · free roadmap on the call (+4 soat)
  { id: "m21", type: "message", text: `[ism], siz hali qadam bosmadingiz — shuning uchun aytaman. Qo'ng'iroqda BEPUL yo'l-xaritasi beraman: holatingizga qarab qaysi qadamdan boshlashni aniqlaymiz. 17 yillik mutaxassisdan bepul maslahat.`, next: "w22" },
  { id: "w22", type: "delay", minutes: 1440, next: "m22" },

  // 22 · 12+ proof recap (+1 kun)
  { id: "m22", type: "message", text: `[ism], sizga 12 dan ortiq shogird hikoyasini ko'rsatdim. Parizoda, Nilufar, Ma'mura, Ra'no, Muslima, Iroda, Dilnoza, Muqaddas, Nazokathon… hamshira, uy bekasi, talaba edi. Bugun — o'z daromadi. Keyingisi SIZ bo'lasiz.`, next: "w23" },
  { id: "w23", type: "delay", minutes: 360, next: "m23" },

  // 23 · urgency 1 (+6 soat)
  { id: "m23", type: "message", text: `[ism], ochiq gaplashaman: keyingi guruh tez orada yopiladi. Kurator har o'quvchini sifatli kuzatishi kerak — shuning uchun o'rin cheklangan. Ulgurmasangiz, keyingi oqim bir necha oydan keyin.`, next: "w24" },
  { id: "w24", type: "delay", minutes: 1440, next: "m24" },

  // 24 · Muhlisa + Nazokat (+1 kun)
  { id: "m24", type: "message", text: `Muhlisa — 0 dan 20 millionga. Nazokat — do'kon sotuvchisi edi, bugun 10 million. Ular kutmadi — boshladi. Kutgan har oy — yo'qotilgan daromad.`, media: { key: "muhlisa_nazokat_photo", kind: "photo" }, next: "w24b" },
  { id: "w24b", type: "delay", minutes: 360, next: "m24b" },

  // 24b · money-math voice (+6 soat)
  { id: "m24b", type: "message", text: `Salom, [ism]. Ko'p so'raladigan savol: "aslida oyiga qancha bo'ladi?" Hisoblaymiz. Bir seans o'rtacha 150 ming. Kuniga atigi 3 ta — har biri 1.5 soat, oilangizga ham vaqt qoladi. Kuniga 450 ming. Oyiga 9 milliondan oshadi. Bu — sehr emas, oddiy matematika. Va ko'p mijozlar oylik emas, kurs bo'yicha keladi — ya'ni doimiy. Buni qanday qurishni to'liq o'rgataman.`, media: { key: "audio_money_math", kind: "voice" }, next: "w25" },
  { id: "w25", type: "delay", minutes: 1440, next: "m25" },

  // 25 · knowledge vs path (+1 kun)
  { id: "m25", type: "message", text: `[ism], shu yergacha keldingiz — jiddiysiz. Endi ichini ko'rsatay. Ko'p odam "kurs oldim" deb o'ylaydi, keyin hech narsa o'zgarmaydi — chunki BILIM oldi, YO'L olmadi. Men sizga to'liq YO'L beraman.`, next: "w26" },
  { id: "w26", type: "delay", minutes: 120, next: "m26" },

  // 26 · modules (+2 soat)
  { id: "m26", type: "message", text: `3 modul, 20 dars:\n1️⃣ Anatomik diagnostika — muammoni aniqlash, shifokorga yo'naltirish\n2️⃣ Kompleks fizioterapiya — massaj, LFK, elektroforez, parafin\n3️⃣ Kamyob mutaxassislik + marketing — mijoz topish, narx qo'yish, sotish\nKursni tugatib — BUTUN KASB egasi bo'lasiz.`, media: { key: "modules_video", kind: "video" }, next: "w27" },
  { id: "w27", type: "delay", minutes: 240, next: "m27" },

  // 27 · bonus stack (+4 soat)
  { id: "m27", type: "message", text: `Va faqat kurs emas:\n🎁 Shaxsiy kurator — har vazifani 48 soatda tekshiradi\n🎁 "Birinchi mijozgacha 15 kun" tizimi\n🎁 Tayyor marketing — Instagram reja + 20 shablon + narx qo'yish\n🎁 Professional sertifikat\n🎁 Umrbod hamjamiyat + jonli efirlar`, next: "w28" },
  { id: "w28", type: "delay", minutes: 1440, next: "m28" },

  // 28 · guarantee (+1 kun)
  { id: "m28", type: "message", text: `[ism], bir nafasda: butun kasb + kurator + mijoz tizimi + marketing + sertifikat. Va risk MENDA:\n🛡 14 kun yoqmasa — 100% qaytadi.\n🛡 90 kun mijoz topilmasa — bepul ishlayman. O'z vaqtimni garovga qo'yaman.`, next: "w28b" },
  { id: "w28b", type: "delay", minutes: 240, next: "m28b" },

  // 28b · first-client voice (+4 soat)
  { id: "m28b", type: "message", text: `[ism], eng ko'p qo'rquv: "mijozni qayerdan topaman?" Ochig'ini aytaman — ular allaqachon oldingizdan o'tyapti. Parizoda birinchi mijozini qayerdan topgan bilasizmi? Qo'shnisining bolasidan. Nilufar — bog'chadagi onalardan. Ma'mura — Instagram orqali, bir hafta ichida. Sirr — kutmaslikda, boshlashda. Kursda aynan shu 15 kunlik tizimni beraman: kundan-kunga kim bilan gaplashish, nima yozish. Birinchi mijozgacha aniq yo'l.`, media: { key: "audio_first_client", kind: "voice" }, next: "w29" },
  { id: "w29", type: "delay", minutes: 1440, next: "m29" },

  // 29 · three tiers (+1 kun)
  { id: "m29", type: "message", text: `▪️ BAZA — o'z bolam uchun\n▪️ KASB — professional kasb egasi ⭐ (to'liq tizim)\n▪️ BIZNES — o'z markazim (KASB + shaxsiy ish)\nQaysi biri sizga mos — qo'ng'iroqda birga tanlaymiz.`, next: "w30" },
  { id: "w30", type: "delay", minutes: 1440, next: "m30" },

  // 30 · the math + Nasiya (+1 kun)
  { id: "m30", type: "message", text: `Hisob: bir seans 150 ming × kuniga 3 = oyiga 9 million+. Ko'p shogird birinchi oydayoq to'lovni qopladi. Uzum Nasiya orqali bo'lib to'lash mumkin — batafsil qo'ng'iroqda.`, next: "w31" },
  { id: "w31", type: "delay", minutes: 240, next: "m31" },

  // 31 · selective (+4 soat)
  { id: "m31", type: "message", text: `[ism], ochiq aytaman: men HAMMAGA o'rgatmayman. Menga jiddiy, natija ko'rsatadigan odam kerak. Qo'ng'iroqda men ham sizni tekshiraman.`, next: "w32" },
  { id: "w32", type: "delay", minutes: 1440, next: "m32" },

  // 32 · urgency 2 (+1 kun)
  { id: "m32", type: "message", text: `[ism], bu oqimda o'rin sanoqli qoldi. To'lganda eshik yopiladi. Bu — soxta shoshirish emas: kurator sifatli ishlashi uchun chinakam cheklov.`, next: "w33" },
  { id: "w33", type: "delay", minutes: 360, next: "m33" },

  // 33 · social proof of momentum (+6 soat)
  { id: "m33", type: "message", text: `Hozir ham ariza qoldirayotganlar bor. Har kuni yangi hamshira bu yo'lga qo'shilyapti. Siz esa hali o'ylaysizmi? Har o'tgan kun — Parizoda allaqachon bosgan qadam.`, next: "w34" },
  { id: "w34", type: "delay", minutes: 1440, next: "m34" },

  // 34 · halal voice (+1 kun)
  { id: "m34", type: "message", text: `[ism], bu kasb nafaqat daromad — savob. Har bola tuzalishiga yordam berganingizda, onaning duosini olasiz. Halol pul, halol duo. Bundan yaxshi kasb bormi?`, media: { key: "halol_voice", kind: "voice" }, next: "w35" },
  { id: "w35", type: "delay", minutes: 240, next: "m35" },

  // 35 · CTA + call button (+4 soat)
  { id: "m35", type: "message", text: `[ism], bitta qadam qoldi. Bepul, bosimsiz suhbat — sizga qaysi tarif, narx, Nasiya shartlarini aytaman. Hech narsa olmasangiz ham — bepul yo'l-xarita.`, urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }], next: "w36" },
  { id: "w36", type: "delay", minutes: 1440, next: "m36" },

  // 36 · two roads + call button (+1 kun)
  { id: "m36", type: "message", text: `[ism], ikki yo'l: bu xabarni yopib, ertaga o'sha 3 millionga qaytish — yoki bir gaplashib, bir yildan keyin "hayotim shundan o'zgargan" deyish. Parizoda ikkinchisini tanladi.`, urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }], next: "w37" },
  { id: "w37", type: "delay", minutes: 360, next: "m37" },

  // 37 · urgency 3 video + call button (+6 soat)
  { id: "m37", type: "message", text: `[ism], ochiq: guruh to'lyapti. Agar bu oqimni o'tkazib yuborsangiz — keyingisi oylar keyin, va narx ham o'zgarishi mumkin. Hozir gaplashsak, eng yaxshi shartlarni beraman.`, media: { key: "urgency_final_video", kind: "video" }, urlButtons: [{ text: "📞 Hoziroq yozilish", url: ADMIN }], next: "w38" },
  { id: "w38", type: "delay", minutes: 1440, next: "m38" },

  // 38 · Ra'no + call button (+1 kun)
  { id: "m38", type: "message", text: `[ism], Ra'no 55 yoshda qo'rqqan, boshlagan — bugun 15 million. Yosh emas, qaror muhim. Sizning navbatingiz. Bugun bir qaror — bir yildan keyin boshqa hayot.`, media: { key: "rano_photo", kind: "photo" }, urlButtons: [{ text: "📞 Bepul suhbatga yozilish", url: ADMIN }], next: "w39" },
  { id: "w39", type: "delay", minutes: 1440, next: "m39" },

  // 39 · anti-fraud notice (+1 kun)
  { id: "m39", type: "message", text: `⚠️ Eslatma: to'lov faqat rasmiy kanal orqali. Firibgarlar nomimizdan yozishi mumkin — begona kartaga to'lov qilmang. Faqat @shahnoza_soliyeva_admin1.`, next: "w40" },
  { id: "w40", type: "delay", minutes: 2880, next: "m40" },

  // 40 · soft close + retarget (+2 kun)
  { id: "m40", type: "message", text: `[ism], balki hozir vaqti emas — mayli. Bepul dars va yo'l-xarita sizniki. Tayyor bo'lganingizda shu yerga yozing. Sizni kutamiz. Omad! 🌿`, urlButtons: [{ text: "📞 Tayyor bo'ldim, yozaman", url: ADMIN }], next: "m_end" },
  { id: "m_end", type: "end", status: "nurtured" },
];

const BY_ID: Record<string, FlowStep> = Object.fromEntries(FLOW.map((s) => [s.id, s]));
export function getStep(id: string): FlowStep | undefined {
  return BY_ID[id];
}
export const ENTRY_STEP = "m1";
