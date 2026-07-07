// Short coaching lines drawn from the user's own protocol PDFs
// (fitness_protocol.pdf "5-lever priority" + protocol_detailed.pdf eating
// rules). Shown as a rotating tip on the balance card — works fully offline.

export interface CoachingTip {
  uz: string;
  en: string;
}

export const COACHING_TIPS: CoachingTip[] = [
  {
    uz: "Har ovqatda kamida 25 g protein — bu muzokara qilinmaydi. Defitsitda mushakni protein saqlaydi.",
    en: 'Protein every meal (≥25 g) — non-negotiable. It keeps muscle in a deficit.',
  },
  {
    uz: "Ertalab bitta shirinlik manbai: xurmo YOKI asal YOKI mayiz — hech qachon uchalasi birga.",
    en: 'One sugar source in the morning: dates OR honey OR raisins — never all three.',
  },
  {
    uz: "Uglevodni asosan mashg'ulot atrofida yeng — kechqurun emas.",
    en: 'Carbs mostly around training — not at night.',
  },
  {
    uz: 'Tushlik va kechki ovqatda sabzavot: hajm + tola = kam kaloriyada to‘qlik.',
    en: 'Vegetables at lunch & dinner: volume + fibre = fullness on fewer calories.',
  },
  {
    uz: "Ovqatdan oldin suv iching; kuniga 2.5–3 litr.",
    en: 'Water before meals; 2.5–3 L/day.',
  },
  {
    uz: "8,000–10,000 qadam — kundalik majburiyat. Bu belga xavfsiz va eng katta yog' yoqish dastagi.",
    en: '8,000–10,000 steps daily — spine-safe and the biggest fat-loss lever.',
  },
  {
    uz: "Tartib: 1) protein 2) kaloriya 3) qadamlar 4) uyqu 5) kuch mashqlari. Shu tartibda bajaring.",
    en: 'Priority: 1) protein 2) calories 3) steps 4) sleep 5) strength — in that order.',
  },
  {
    uz: "Yomon uyqu ochlikni oshiradi va ozishni to'xtatadi — telefonni erta qo'ying.",
    en: 'Poor sleep raises hunger and stalls fat loss — put the phone down early.',
  },
  {
    uz: "Sekin ozish (~0.5–0.65 kg/hafta) mushakni himoya qiladi. Shoshilmang.",
    en: 'Slow loss (~0.5–0.65 kg/week) protects muscle. Don’t rush.',
  },
  {
    uz: "Maqsaddan oshmaslik — yeb keyin yoqishdan ko'ra har doim yaxshiroq.",
    en: 'Staying under target always beats eat-then-burn.',
  },
];

export function tipOfTheDay(dateISO: string): CoachingTip {
  // Deterministic per-day rotation
  let h = 0;
  for (const ch of dateISO) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COACHING_TIPS[h % COACHING_TIPS.length];
}
