-- Intern is a new role with identical access to Staff (same RLS scope,
-- own-department only) — just a distinct label for headcount/reporting
-- purposes. See lib/constants.js ROLE for the UI-side definition.
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'intern';

ALTER POLICY activity_select_dept ON activity_log
  USING ((get_user_role() = ANY (ARRAY['dept_head'::user_role_enum, 'staff'::user_role_enum, 'intern'::user_role_enum]))
    AND (job_id IN (SELECT jobs.id FROM jobs WHERE (jobs.department = get_user_department()))));

ALTER POLICY jobs_select_dept ON jobs
  USING ((get_user_role() = ANY (ARRAY['dept_head'::user_role_enum, 'staff'::user_role_enum, 'intern'::user_role_enum]))
    AND (department = get_user_department()));

ALTER POLICY jobs_update_staff ON jobs
  USING ((get_user_role() = ANY (ARRAY['staff'::user_role_enum, 'intern'::user_role_enum])) AND (department = get_user_department()));

ALTER POLICY ledger_entries_select_dept ON ledger_entries
  USING ((get_user_role() = ANY (ARRAY['dept_head'::user_role_enum, 'staff'::user_role_enum, 'intern'::user_role_enum]))
    AND (department = get_user_department()));
