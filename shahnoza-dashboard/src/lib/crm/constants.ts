import type {
  CloserLevel,
  LeadStage,
  Manba,
  NpsStage,
  PaymentStatus,
  PaymentType,
  StudentStage,
  Tarif,
} from "@/types/crm";

export const PIPELINE_STAGES: LeadStage[] = [
  "yangi_lead",
  "aloqa_kutilmoqda",
  "birinchi_aloqa",
  "malumot_yuborildi",
  "qiziqarli",
  "to_lov_qilinmoqda",
];

export const CLOSED_STAGES: LeadStage[] = [
  "yutuq",
  "muvaffaqiyatsizlik",
  "vozvrat",
];

export const ALL_STAGES: LeadStage[] = [...PIPELINE_STAGES, ...CLOSED_STAGES];

/** Top-border accent for Bitrix-style pipeline columns. */
export const STAGE_ACCENT: Record<LeadStage, string> = {
  yangi_lead: "border-t-blue-500",
  aloqa_kutilmoqda: "border-t-sky-500",
  birinchi_aloqa: "border-t-indigo-500",
  malumot_yuborildi: "border-t-violet-500",
  qiziqarli: "border-t-amber-500",
  to_lov_qilinmoqda: "border-t-orange-500",
  yutuq: "border-t-emerald-500",
  muvaffaqiyatsizlik: "border-t-red-500",
  vozvrat: "border-t-zinc-400",
};

/** Filled header strip — same palette as STAGE_ACCENT. */
export const STAGE_STRIP: Record<LeadStage, string> = {
  yangi_lead: "bg-blue-500",
  aloqa_kutilmoqda: "bg-sky-500",
  birinchi_aloqa: "bg-indigo-500",
  malumot_yuborildi: "bg-violet-500",
  qiziqarli: "bg-amber-500",
  to_lov_qilinmoqda: "bg-orange-500",
  yutuq: "bg-emerald-500",
  muvaffaqiyatsizlik: "bg-red-500",
  vozvrat: "bg-zinc-400",
};

export const BOSQICH_LABELS: Record<LeadStage, string> = {
  yangi_lead: "Yangi lead",
  aloqa_kutilmoqda: "Aloqa kutilmoqda",
  birinchi_aloqa: "Birinchi aloqa",
  malumot_yuborildi: "Ma'lumot yuborildi",
  qiziqarli: "Qiziqarli",
  to_lov_qilinmoqda: "To'lov qilinmoqda",
  yutuq: "Yutuq",
  muvaffaqiyatsizlik: "Muvaffaqiyatsizlik",
  vozvrat: "Vozvrat",
};

export const MANUAL_LOG_HARAKAT = [
  "qongiroq",
  "sms",
  "email",
  "whatsapp",
  "telegram",
  "izoh",
] as const;

export type ManualLogHarakat = (typeof MANUAL_LOG_HARAKAT)[number];

export const HARAKAT_LABELS: Record<string, string> = {
  yaratildi: "Yaratildi",
  bosqich_ozgardi: "Bosqich o'zgardi",
  rejalashtirildi: "Rejalashtirildi",
  qongiroq: "Qo'ng'iroq",
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  izoh: "Izoh",
  vazifa: "Vazifa",
  created: "Yaratildi",
  call_attempt: "Qo'ng'iroq urinishi",
  call_connected: "Qo'ng'iroq ulandi",
  stage_change: "Bosqich o'zgardi",
  note: "Izoh",
  template_sent: "Shablon yuborildi",
  asset_sent: "Material yuborildi",
  shartnoma: "Shartnoma",
  tayinlandi: "Tayinlandi",
  ogohlantirish: "Ogohlantirish",
  qarz_eslatma: "Qarz eslatmasi",
  nps_boshlandi: "NPS boshlandi",
  nps_javob: "NPS javob",
};

export const STUDENT_STAGES: StudentStage[] = [
  "yangi_oquvchi",
  "guruhga_qoshildi",
  "kursda",
  "pauzada",
  "kurs_tugadi",
  "xulosa_yozildi",
];

export const STUDENT_STAGE_LABELS: Record<StudentStage, string> = {
  yangi_oquvchi: "Yangi o'quvchi",
  guruhga_qoshildi: "Guruhga qo'shildi",
  kursda: "Kursda",
  pauzada: "Pauzada",
  kurs_tugadi: "Kurs tugadi",
  xulosa_yozildi: "Xulosa yozildi",
};

export const STUDENT_STAGE_BADGE_CLASS: Record<StudentStage, string> = {
  yangi_oquvchi: "border-transparent bg-zinc-100 text-zinc-700",
  guruhga_qoshildi: "border-transparent bg-blue-100 text-blue-800",
  kursda: "border-transparent bg-green-100 text-green-800",
  pauzada: "border-transparent bg-amber-100 text-amber-800",
  kurs_tugadi: "border-transparent bg-purple-100 text-purple-800",
  xulosa_yozildi: "border-transparent bg-teal-100 text-teal-800",
};

export const NPS_STAGE_LABELS: Record<NpsStage, string> = {
  nps_soraladi: "NPS so'raladi",
  yuqori_ball: "Yuqori ball",
  past_ball: "Past ball",
};

export const NPS_STAGE_BADGE_CLASS: Record<NpsStage, string> = {
  nps_soraladi: "border-transparent bg-amber-100 text-amber-800",
  yuqori_ball: "border-transparent bg-green-100 text-green-800",
  past_ball: "border-transparent bg-red-100 text-red-800",
};

export const PAYMENT_TYPES: PaymentType[] = ["Naqd", "Uzum", "Ichki"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Kutilmoqda",
  confirmed: "Tasdiqlangan",
  refunded: "Qaytarilgan",
};

export const PAYMENT_STATUS_BADGE_CLASS: Record<PaymentStatus, string> = {
  pending: "border-transparent bg-amber-100 text-amber-800",
  confirmed: "border-transparent bg-green-100 text-green-800",
  refunded: "border-transparent bg-red-100 text-red-800",
};

export const TARIF_OPTIONS: Tarif[] = ["BAZA", "KASB", "BIZNES", "noma_lum"];

export const MANBA_OPTIONS: Manba[] = [
  "Konsultatsiya",
  "Predzapis",
  "Bot",
  "DM",
  "Tanish",
  "Referral",
  "Meta",
  "Efir",
  "Boshqa",
];

export const CLOSER_LEVEL_LABELS: Record<CloserLevel, string> = {
  junior_closer: "Junior",
  closer: "Closer",
  senior_closer: "Senior",
  off_calendar: "Off calendar",
  terminated: "Terminated",
};

export const TARIF_BADGE_CLASS: Record<Tarif, string> = {
  BAZA: "border-transparent bg-blue-100 text-blue-800",
  KASB: "border-transparent bg-amber-100 text-amber-800",
  BIZNES: "border-transparent bg-emerald-100 text-emerald-800",
  noma_lum: "border-transparent bg-muted text-muted-foreground",
};

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
