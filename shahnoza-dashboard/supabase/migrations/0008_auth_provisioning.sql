-- 0008_auth_provisioning.sql
-- Keep public.users in sync with auth.users.
--
-- When someone completes magic-link login, Supabase creates a row in
-- auth.users. This trigger links it to a public.users row:
--   * if a users row with the same email already exists (pre-invited by a
--     super_admin), we just attach auth_id;
--   * otherwise we create a pending row (role = NULL, is_active = false) that a
--     super_admin can activate + assign a role in /settings/users.
--
-- The very first user is bootstrapped to super_admin so the system is usable
-- out of the box.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_id UUID;
  user_count  INTEGER;
BEGIN
  SELECT id INTO existing_id FROM public.users WHERE email = NEW.email LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.users SET auth_id = NEW.id WHERE id = existing_id;
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO user_count FROM public.users;

  INSERT INTO public.users (auth_id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN user_count = 0 THEN 'super_admin' ELSE NULL END,
    CASE WHEN user_count = 0 THEN true ELSE false END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
