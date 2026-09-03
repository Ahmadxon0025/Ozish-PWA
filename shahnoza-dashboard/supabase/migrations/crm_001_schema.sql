-- Million Massaj Akademiyasi CRM — Day 1 schema
-- Run once in Supabase SQL Editor (not the migration runner).
-- After it succeeds, wait a few seconds or run: NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- A. ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'expert', 'closer', 'curator');
CREATE TYPE closer_level AS ENUM (
  'junior_closer',
  'closer',
  'senior_closer',
  'off_calendar',
  'terminated'
);
CREATE TYPE lead_stage AS ENUM (
  'yangi_lead',
  'aloqa_kutilmoqda',
  'birinchi_aloqa',
  'malumot_yuborildi',
  'qiziqarli',
  'to_lov_qilinmoqda',
  'yutuq',
  'muvaffaqiyatsizlik',
  'vozvrat'
);
CREATE TYPE lid_status AS ENUM (
  'yangi_lid',
  'kotarmadi',
  'oylayapti',
  'oila_maslahat',
  'band_qilish',
  'shartnoma',
  'yoqotildi'
);
CREATE TYPE student_stage AS ENUM (
  'yangi_oquvchi',
  'guruhga_qoshildi',
  'kursda',
  'pauzada',
  'kurs_tugadi',
  'xulosa_yozildi'
);
CREATE TYPE nps_stage AS ENUM ('nps_soraladi', 'past_ball', 'yuqori_ball');
CREATE TYPE saqlash_bucket AS ENUM (
  'qiziqdi_sotmadi',
  'kotarmadi_exhausted',
  'sotib_olganlar_arxivi',
  'ochirildi'
);
CREATE TYPE tarif AS ENUM ('BAZA', 'KASB', 'BIZNES', 'noma_lum');
CREATE TYPE manba AS ENUM (
  'Konsultatsiya',
  'Predzapis',
  'Bot',
  'DM',
  'Tanish',
  'Referral',
  'Meta',
  'Efir',
  'Boshqa'
);
CREATE TYPE segment AS ENUM ('Hamshira', 'Uy_bekasi', 'Amaliyotchi', 'Boshqa');
CREATE TYPE oylik_daromad AS ENUM (
  'yoq',
  'bir_bir_besh',
  'bir_besh_ikki',
  'ikki_uch',
  'uch_plus'
);
CREATE TYPE tayyorlik AS ENUM ('Toliq tayyor', 'Qisman tayyor', 'Tayyor emas');
CREATE TYPE payment_type AS ENUM ('Naqd', 'Uzum', 'Ichki');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'refunded');
CREATE TYPE activity_type AS ENUM (
  'created',
  'call_attempt',
  'call_connected',
  'stage_change',
  'note',
  'template_sent',
  'asset_sent',
  'callback_set'
);
CREATE TYPE comm_channel AS ENUM (
  'qongiroq',
  'telegram',
  'whatsapp',
  'email',
  'sms',
  'izoh'
);

-- =============================================================================
-- B. TABLES
-- =============================================================================

CREATE TABLE crm_closer_levels (
  level closer_level PRIMARY KEY,
  title_uz TEXT NOT NULL,
  weekly_contract_min INT NOT NULL,
  weekly_dial_min INT NOT NULL,
  weeks_required INT NOT NULL,
  cumulative_min INT NOT NULL,
  commission NUMERIC(6, 3) NOT NULL DEFAULT 0
);

CREATE TABLE crm_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'closer',
  closer_level closer_level REFERENCES crm_closer_levels (level),
  is_active BOOLEAN NOT NULL DEFAULT true,
  referral_names TEXT
);

CREATE TABLE crm_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kurs_boshlanish DATE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE crm_price_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES crm_cohorts (id) ON DELETE CASCADE,
  tarif tarif,
  narx BIGINT,
  baza BIGINT,
  kasb BIGINT,
  biznes BIGINT
);

CREATE TABLE crm_price_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES crm_cohorts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  tarif tarif,
  narx BIGINT,
  eski_narx BIGINT,
  chegirma_foiz INT,
  baza BIGINT NOT NULL,
  kasb BIGINT NOT NULL,
  biznes BIGINT NOT NULL,
  nasiya_baza BIGINT NOT NULL,
  nasiya_kasb BIGINT NOT NULL,
  nasiya_biznes BIGINT NOT NULL
);

CREATE TABLE crm_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ism TEXT NOT NULL,
  telefon TEXT NOT NULL,
  telegram TEXT,
  bot_subscriber_id BIGINT,
  tarif tarif NOT NULL DEFAULT 'noma_lum',
  tarif_qiziqishi tarif,
  manba manba NOT NULL DEFAULT 'Boshqa',
  cohort_id UUID REFERENCES crm_cohorts (id),
  izoh TEXT,
  bosqich lead_stage NOT NULL DEFAULT 'yangi_lead',
  bosqich_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ball INT,
  narx BIGINT,
  eski_narx BIGINT,
  keyingi_aloqa TIMESTAMPTZ,
  viloyat TEXT,
  segment segment,
  oylik_daromad oylik_daromad,
  tayyorlik tayyorlik,
  lid_status lid_status,
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX crm_leads_telefon_uidx ON crm_leads (telefon) WHERE is_deleted = false;

CREATE TABLE crm_lead_sotuvchi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  sotuvchi_id UUID NOT NULL REFERENCES crm_users (id) ON DELETE CASCADE,
  birlamchi BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (lead_id, sotuvchi_id)
);

CREATE TABLE crm_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  harakat TEXT NOT NULL,
  kim UUID REFERENCES crm_users (id),
  izoh TEXT,
  matn TEXT,
  channel comm_channel
);

CREATE TABLE crm_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE TABLE crm_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id UUID REFERENCES crm_leads (id),
  student_id UUID,
  amount BIGINT NOT NULL,
  type payment_type NOT NULL DEFAULT 'Naqd',
  status payment_status NOT NULL DEFAULT 'pending'
);

CREATE TABLE crm_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id UUID REFERENCES crm_leads (id),
  ism TEXT NOT NULL,
  stage student_stage NOT NULL DEFAULT 'yangi_oquvchi',
  payment_id UUID REFERENCES crm_payments (id)
);

ALTER TABLE crm_payments
  ADD CONSTRAINT crm_payments_student_fk
  FOREIGN KEY (student_id) REFERENCES crm_students (id);

CREATE TABLE crm_templates (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  stage lead_stage,
  variables TEXT[]
);

CREATE TABLE crm_assets (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  suggested_for TEXT
);

CREATE TABLE crm_nps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id UUID REFERENCES crm_students (id),
  stage nps_stage NOT NULL DEFAULT 'nps_soraladi',
  ball INT
);

CREATE TABLE crm_weekly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id UUID NOT NULL REFERENCES crm_users (id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  dials INT NOT NULL DEFAULT 0,
  connected INT NOT NULL DEFAULT 0,
  UNIQUE (closer_id, week_start)
);

CREATE TABLE crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id UUID REFERENCES crm_leads (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  done BOOLEAN NOT NULL DEFAULT false
);

CREATE VIEW crm_active_window AS
SELECT *
FROM crm_price_windows
WHERE now() BETWEEN starts_at AND ends_at;

CREATE INDEX crm_leads_bosqich_idx ON crm_leads (bosqich);
CREATE INDEX crm_leads_yaratilgan_idx ON crm_leads (yaratilgan DESC);
CREATE INDEX crm_leads_keyingi_aloqa_idx ON crm_leads (keyingi_aloqa);
CREATE INDEX crm_log_lead_idx ON crm_log (lead_id, created_at DESC);
CREATE INDEX crm_lead_activities_lead_idx ON crm_lead_activities (lead_id, created_at DESC);
CREATE INDEX crm_lead_sotuvchi_lead_idx ON crm_lead_sotuvchi (lead_id) WHERE birlamchi = true;

-- =============================================================================
-- C. FUNCTIONS + TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION crm_compute_score(lead_row crm_leads)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  score INT := 0;
BEGIN
  score := score + CASE lead_row.tayyorlik
    WHEN 'Toliq tayyor' THEN 30
    WHEN 'Qisman tayyor' THEN 15
    WHEN 'Tayyor emas' THEN 0
    ELSE 0
  END;
  score := score + CASE lead_row.tarif
    WHEN 'BIZNES' THEN 25
    WHEN 'KASB' THEN 15
    WHEN 'BAZA' THEN 10
    ELSE 0
  END;
  score := score + CASE lead_row.manba
    WHEN 'Referral' THEN 20
    WHEN 'Tanish' THEN 15
    WHEN 'Konsultatsiya' THEN 12
    WHEN 'Predzapis' THEN 10
    ELSE 5
  END;
  RETURN score;
END;
$$;

CREATE OR REPLACE FUNCTION crm_touch_bosqich()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.bosqich IS DISTINCT FROM OLD.bosqich THEN
    NEW.bosqich_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_leads_bosqich_touch
BEFORE UPDATE ON crm_leads
FOR EACH ROW
EXECUTE FUNCTION crm_touch_bosqich();

CREATE OR REPLACE FUNCTION crm_first_contact_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.bosqich = 'yangi_lead'
     AND NEW.bosqich IS DISTINCT FROM OLD.bosqich THEN
    INSERT INTO crm_log (lead_id, harakat, izoh, matn)
    VALUES (NEW.id, 'birinchi_aloqa', 'Birinchi aloqa', 'Birinchi aloqa');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_leads_first_contact
AFTER UPDATE ON crm_leads
FOR EACH ROW
EXECUTE FUNCTION crm_first_contact_log();

-- =============================================================================
-- D. RLS (service_role bypasses these; Day 2 uses the admin client)
-- =============================================================================

ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_closer_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_price_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_price_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_sotuvchi ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_nps ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_weekly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_users_self ON crm_users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR coalesce(auth.jwt() ->> 'role', '') = 'admin');

GRANT USAGE ON TYPE user_role, closer_level, lead_stage, lid_status, student_stage,
  nps_stage, saqlash_bucket, tarif, manba, segment, oylik_daromad, tayyorlik,
  payment_type, payment_status, activity_type, comm_channel TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION crm_compute_score(crm_leads) TO service_role, authenticated;

-- =============================================================================
-- E. SEED
-- =============================================================================

INSERT INTO crm_closer_levels VALUES
  ('junior_closer', 'Junior Closer', 1, 100, 6, 8, 0.000),
  ('closer', 'Closer', 2, 120, 6, 20, 0.050),
  ('senior_closer', 'Senior Closer', 3, 140, 6, 40, 0.080),
  ('off_calendar', 'Off calendar', 0, 0, 0, 0, 0.000),
  ('terminated', 'Terminated', 0, 0, 0, 0, 0.000);

INSERT INTO crm_config (key, value) VALUES
  ('recognition_budget_monthly', '500000');

INSERT INTO crm_cohorts (name, kurs_boshlanish, is_active)
VALUES ('Oktyabr 2026', '2026-10-01', true);

INSERT INTO crm_price_config (cohort_id, baza, kasb, biznes)
SELECT id, 1200000, 2890000, 4890000
FROM crm_cohorts
WHERE name = 'Oktyabr 2026';

INSERT INTO crm_templates (key, body, stage) VALUES
  ('KT-1', 'Assalomu alaykum, {ism} opa 😊 Shahnoza Soliyeva akademiyasidan {closer}.', 'yangi_lead'),
  ('KT-2', '{ism} opa, kurs haqida qisqacha yozib qo''ydim. Savol bo''lsa yozing.', 'malumot_yuborildi'),
  ('KT-3', '{ism} opa, joyingiz band qilindi. {tarif} tarifi {narx_locked} so''m siz uchun muzlatildi.', 'to_lov_qilinmoqda');

INSERT INTO crm_assets (key, title, suggested_for, url) VALUES
  ('parizoda_v', 'Parizoda A→B video', 'Hamshira, any stage', '');

NOTIFY pgrst, 'reload schema';
