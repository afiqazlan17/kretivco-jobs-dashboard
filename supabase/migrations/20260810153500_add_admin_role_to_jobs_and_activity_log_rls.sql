-- The 'admin' role (Syahren) was added to user_role_enum and the app's
-- ROLE constant, but jobs/activity_log RLS policies were never extended to
-- cover it — so Admin could not see any department's job queue, update
-- jobs, or view activity logs, despite the role being scoped for
-- "all departments, jobs & customers" access.
CREATE POLICY jobs_select_admin ON public.jobs
  FOR SELECT
  USING (get_user_role() = 'admin'::user_role_enum);

CREATE POLICY jobs_update_admin ON public.jobs
  FOR UPDATE
  USING (get_user_role() = 'admin'::user_role_enum);

CREATE POLICY activity_select_admin ON public.activity_log
  FOR SELECT
  USING (get_user_role() = 'admin'::user_role_enum);
