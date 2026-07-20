-- 0025_lead_amocrm_fields.sql
-- Additive. Capture the real AmoCRM funnel + custom fields on leads so the
-- sales dashboard + AI brain can use them. All nullable; filled by the sync.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pipeline_name     TEXT,   -- Sotuv Forum / O'quvchilar
  ADD COLUMN IF NOT EXISTS stage_name        TEXT,   -- real stage (Yangi mijoz…)
  ADD COLUMN IF NOT EXISTS source_name       TEXT,   -- Manba (Instagram/Telegram…)
  ADD COLUMN IF NOT EXISTS tarif             TEXT,   -- Ta'rif (Standart/Expert/VIP)
  ADD COLUMN IF NOT EXISTS payment_method    TEXT,   -- To'lov usuli
  ADD COLUMN IF NOT EXISTS cancel_reason     TEXT,   -- Rad etish sababi
  ADD COLUMN IF NOT EXISTS segment           TEXT,   -- Segment
  ADD COLUMN IF NOT EXISTS region            TEXT,   -- Manzili
  ADD COLUMN IF NOT EXISTS goal              TEXT,   -- Maqsad
  ADD COLUMN IF NOT EXISTS course_format     TEXT,   -- Kurs formati
  ADD COLUMN IF NOT EXISTS manager_name      TEXT,   -- Menejer
  ADD COLUMN IF NOT EXISTS amount_uzs        NUMERIC,-- native deal price (so'm)
  ADD COLUMN IF NOT EXISTS outstanding_uzs   NUMERIC,-- Qoldiq summasi
  ADD COLUMN IF NOT EXISTS finished_course   BOOLEAN,-- Kursni tugatdi
  ADD COLUMN IF NOT EXISTS course_started_at DATE;   -- Dars boshlangan sana

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage_name);
CREATE INDEX IF NOT EXISTS idx_leads_source_name ON leads(source_name);
