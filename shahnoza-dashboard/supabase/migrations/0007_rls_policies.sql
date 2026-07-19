-- 0007_rls_policies.sql
-- Row Level Security for all tables + role helpers.
--
-- Access model (5 roles):
--   super_admin    full access to everything
--   owner          read all, writes nothing sensitive (finance/leads/sales read-only)
--   sales_manager  read/write leads, sales, tasks; read marketing/finance
--   sales          read/write own leads & sales; read own compensation/commissions
--   curator        read/write own tasks only
--
-- The tRPC layer also gates every mutation by role; RLS is the defense-in-depth
-- boundary that also protects any direct (browser / anon-key) access.

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they read `users` WITHOUT triggering the
-- table's own RLS (prevents infinite recursion in policies below).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_uid()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$ SELECT public.app_role() = 'super_admin' $$;

-- Roles allowed to read the whole book of business.
CREATE OR REPLACE FUNCTION public.can_read_all()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$ SELECT public.app_role() IN ('super_admin', 'owner', 'sales_manager') $$;

-- Roles allowed to manage the sales pipeline.
CREATE OR REPLACE FUNCTION public.can_manage_sales()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$ SELECT public.app_role() IN ('super_admin', 'sales_manager') $$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_compensation   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bonuses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (true); -- names/roles are needed everywhere for assignment/display

CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR id = public.app_uid())
  WITH CHECK (public.is_super_admin() OR id = public.app_uid());

CREATE POLICY users_delete ON users FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- user_compensation
-- ---------------------------------------------------------------------------
CREATE POLICY comp_select ON user_compensation FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('super_admin', 'owner')
    OR user_id = public.app_uid()
  );

CREATE POLICY comp_write ON user_compensation FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- products (reference data)
-- ---------------------------------------------------------------------------
CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY products_write ON products FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- traffic_sources (reference data)
-- ---------------------------------------------------------------------------
CREATE POLICY traffic_select ON traffic_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY traffic_write ON traffic_sources FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
CREATE POLICY leads_select ON leads FOR SELECT TO authenticated
  USING (public.can_read_all() OR assigned_to = public.app_uid());

CREATE POLICY leads_insert ON leads FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_sales() OR assigned_to = public.app_uid());

CREATE POLICY leads_update ON leads FOR UPDATE TO authenticated
  USING (public.can_manage_sales() OR assigned_to = public.app_uid())
  WITH CHECK (public.can_manage_sales() OR assigned_to = public.app_uid());

CREATE POLICY leads_delete ON leads FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
CREATE POLICY sales_select ON sales FOR SELECT TO authenticated
  USING (public.can_read_all() OR sales_person_id = public.app_uid());

CREATE POLICY sales_insert ON sales FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_sales() OR sales_person_id = public.app_uid());

CREATE POLICY sales_update ON sales FOR UPDATE TO authenticated
  USING (public.can_manage_sales() OR sales_person_id = public.app_uid())
  WITH CHECK (public.can_manage_sales() OR sales_person_id = public.app_uid());

CREATE POLICY sales_delete ON sales FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = payments.sale_id AND s.sales_person_id = public.app_uid()
    )
  );

CREATE POLICY payments_write ON payments FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

-- ---------------------------------------------------------------------------
-- expense_categories (reference data)
-- ---------------------------------------------------------------------------
CREATE POLICY expcat_select ON expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY expcat_write ON expense_categories FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- expenses  (owner = read-only; sales_manager + super_admin = write)
-- ---------------------------------------------------------------------------
CREATE POLICY expenses_select ON expenses FOR SELECT TO authenticated
  USING (public.can_read_all());

CREATE POLICY expenses_write ON expenses FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

-- ---------------------------------------------------------------------------
-- commissions  (own read; super_admin write)
-- ---------------------------------------------------------------------------
CREATE POLICY commissions_select ON commissions FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('super_admin', 'owner')
    OR user_id = public.app_uid()
  );

CREATE POLICY commissions_write ON commissions FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- monthly_bonuses  (own read; super_admin write)
-- ---------------------------------------------------------------------------
CREATE POLICY bonuses_select ON monthly_bonuses FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('super_admin', 'owner')
    OR user_id = public.app_uid()
  );

CREATE POLICY bonuses_write ON monthly_bonuses FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
CREATE POLICY tasks_select ON tasks FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR assigned_to = public.app_uid()
    OR created_by = public.app_uid()
  );

CREATE POLICY tasks_insert ON tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = public.app_uid() OR public.can_manage_sales());

CREATE POLICY tasks_update ON tasks FOR UPDATE TO authenticated
  USING (
    public.can_manage_sales()
    OR assigned_to = public.app_uid()
    OR created_by = public.app_uid()
  )
  WITH CHECK (
    public.can_manage_sales()
    OR assigned_to = public.app_uid()
    OR created_by = public.app_uid()
  );

CREATE POLICY tasks_delete ON tasks FOR DELETE TO authenticated
  USING (public.can_manage_sales() OR created_by = public.app_uid());

-- ---------------------------------------------------------------------------
-- task_comments
-- ---------------------------------------------------------------------------
CREATE POLICY task_comments_select ON task_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
        AND (
          public.can_read_all()
          OR t.assigned_to = public.app_uid()
          OR t.created_by = public.app_uid()
        )
    )
  );

CREATE POLICY task_comments_insert ON task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_uid());

CREATE POLICY task_comments_modify ON task_comments FOR UPDATE TO authenticated
  USING (user_id = public.app_uid()) WITH CHECK (user_id = public.app_uid());

CREATE POLICY task_comments_delete ON task_comments FOR DELETE TO authenticated
  USING (user_id = public.app_uid() OR public.is_super_admin());

-- ---------------------------------------------------------------------------
-- integration_tokens  (super_admin only — sensitive secrets)
-- ---------------------------------------------------------------------------
CREATE POLICY integration_tokens_all ON integration_tokens FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
CREATE POLICY sync_logs_select ON sync_logs FOR SELECT TO authenticated
  USING (public.app_role() IN ('super_admin', 'owner'));

CREATE POLICY sync_logs_write ON sync_logs FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
