-- 0031_payment_schedule.sql
-- Additive. Track B: turn the dormant `payments` table into an instalment
-- schedule anchored to a lead (the buyer). Each row is a planned or received
-- instalment in so'm (booked). Powers collection %, DPD, prior-month debt.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_uzs NUMERIC;                 -- booked so'm
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rate       NUMERIC;                 -- UZS/USD at booking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS seq        INTEGER;                 -- instalment #
ALTER TABLE payments ADD COLUMN IF NOT EXISTS note       TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_lead   ON payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_payments_due    ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Broaden RLS to cover lead-anchored instalments (sale link stays valid too).
DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR EXISTS (SELECT 1 FROM sales s WHERE s.id = payments.sale_id AND s.sales_person_id = public.app_uid())
    OR EXISTS (SELECT 1 FROM leads l WHERE l.id = payments.lead_id AND l.assigned_to = public.app_uid())
  );

DROP POLICY IF EXISTS payments_write ON payments;
CREATE POLICY payments_write ON payments FOR ALL TO authenticated
  USING (
    public.can_read_all()
    OR EXISTS (SELECT 1 FROM leads l WHERE l.id = payments.lead_id AND l.assigned_to = public.app_uid())
  )
  WITH CHECK (
    public.can_read_all()
    OR EXISTS (SELECT 1 FROM leads l WHERE l.id = payments.lead_id AND l.assigned_to = public.app_uid())
  );
