/**
 * Million Massaj Akademiyasi CRM types (Day 1).
 * Mirrors supabase/migrations/crm_001_schema.sql — table crm_leads → CrmLead.
 * Nullable SQL columns are T | null.
 */

export type UserRole = "admin" | "expert" | "closer" | "curator";

export type CloserLevel =
  | "junior_closer"
  | "closer"
  | "senior_closer"
  | "off_calendar"
  | "terminated";

export type LeadStage =
  | "yangi_lead"
  | "aloqa_kutilmoqda"
  | "birinchi_aloqa"
  | "malumot_yuborildi"
  | "qiziqarli"
  | "to_lov_qilinmoqda"
  | "yutuq"
  | "muvaffaqiyatsizlik"
  | "vozvrat";

export type Bosqich = LeadStage;

export type StudentStage =
  | "yangi_oquvchi"
  | "guruhga_qoshildi"
  | "kursda"
  | "pauzada"
  | "kurs_tugadi"
  | "xulosa_yozildi";

export type NpsStage = "nps_soraladi" | "past_ball" | "yuqori_ball";

export type SaqlashBucket =
  | "qiziqdi_sotmadi"
  | "kotarmadi_exhausted"
  | "sotib_olganlar_arxivi"
  | "ochirildi";

export type Tarif = "BAZA" | "KASB" | "BIZNES" | "noma_lum";

export type Manba =
  | "Konsultatsiya"
  | "Predzapis"
  | "Bot"
  | "DM"
  | "Tanish"
  | "Referral"
  | "Meta"
  | "Efir"
  | "Boshqa";

export type Segment = "Hamshira" | "Uy_bekasi" | "Amaliyotchi" | "Boshqa";

export type OylikDaromad =
  | "yoq"
  | "bir_bir_besh"
  | "bir_besh_ikki"
  | "ikki_uch"
  | "uch_plus";

export type PaymentType = "Naqd" | "Uzum" | "Ichki";

export type PaymentStatus = "pending" | "confirmed" | "refunded";

export type ActivityType =
  | "created"
  | "call_attempt"
  | "call_connected"
  | "stage_change"
  | "note"
  | "template_sent"
  | "asset_sent";

export type Harakat = "yaratildi" | ActivityType;

export type Tayyorlik = "Toliq tayyor" | "Qisman tayyor" | "Tayyor emas";

export type CrmUser = {
  id: string;
  created_at: string;
  name: string;
  email: string | null;
  role: UserRole;
  closer_level: CloserLevel | null;
};

export type CrmCohort = {
  id: string;
  name: string;
  kurs_boshlanish: string | null;
};

export type CrmPriceWindow = {
  id: string;
  cohort_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  tarif: Tarif | null;
  narx: number | null;
  eski_narx: number | null;
  chegirma_foiz: number | null;
  baza: number | null;
  kasb: number | null;
  biznes: number | null;
  nasiya_baza: number | null;
  nasiya_kasb: number | null;
  nasiya_biznes: number | null;
};

export type CrmActiveWindow = CrmPriceWindow;

export type CrmPriceConfig = {
  id: string | null;
  cohort_id: string;
  tarif: Tarif | null;
  narx: number | null;
  baza: number | null;
  kasb: number | null;
  biznes: number | null;
};

export type CrmConfig = {
  key: string;
  value: unknown;
};

export type CrmLead = {
  id: string;
  yaratilgan: string;
  created_at: string | null;
  ism: string;
  telefon: string;
  telegram: string | null;
  bot_subscriber_id: number | null;
  tarif: Tarif;
  tarif_qiziqishi: Tarif | null;
  manba: Manba;
  cohort_id: string | null;
  izoh: string | null;
  bosqich: LeadStage;
  bosqich_updated_at: string;
  ball: number | null;
  narx: number | null;
  eski_narx: number | null;
  keyingi_aloqa: string | null;
  viloyat: string | null;
  segment: Segment | null;
  oylik_daromad: OylikDaromad | null;
  tayyorlik: Tayyorlik | null;
};

export type CrmLeadSotuvchi = {
  id: string;
  lead_id: string;
  sotuvchi_id: string;
  birlamchi: boolean;
};

export type CrmLog = {
  id: string;
  lead_id: string;
  harakat: Harakat;
  kim: string | null;
  matn: string | null;
  created_at: string;
};

export type CrmLeadActivity = {
  id: string;
  lead_id: string;
  type: ActivityType;
  created_at: string;
};

export type CrmPayment = {
  id: string;
  created_at: string;
  lead_id: string | null;
  student_id: string | null;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
};

export type CrmStudent = {
  id: string;
  created_at: string;
  lead_id: string | null;
  ism: string;
  stage: StudentStage;
};

export type CrmTemplate = {
  key: string;
  body: string;
  stage: LeadStage | null;
  variables: string[] | null;
};

export type CrmAsset = {
  key: string;
  title: string;
  url: string;
  suggested_for: LeadStage | null;
};

export type CrmNps = {
  id: string;
  created_at: string;
  student_id: string | null;
  stage: NpsStage;
  ball: number | null;
};

export type CrmCloserWeek = {
  id: string;
  closer_id: string;
  week_start: string;
  dials: number;
  connected: number;
};
