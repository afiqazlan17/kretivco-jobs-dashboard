-- Job deletion: previously BOD-only with no delete UI at all. Now Dept
-- Head can also delete a job, scoped to their own visible department(s)
-- — same access boundary as their other job actions.
--
-- Deletion requires a reason and must be logged (see lib/hooks.js
-- deleteJob()). To make that log survive the job row being deleted:
--   - activity_log.job_id FK was ON DELETE CASCADE, which would have
--     wiped a job's entire history (including the "deleted" entry
--     itself) the instant the job was removed. Changed to SET NULL.
--   - Added activity_log.job_code, a denormalized snapshot of the job's
--     human-readable code (e.g. "KP-2026-001"), backfilled from the
--     current jobs table, so logs stay identifiable once job_id goes
--     null. Populated by the app on every future log write, not just
--     deletions.
ALTER TYPE activity_action_enum ADD VALUE IF NOT EXISTS 'deleted';

ALTER TABLE activity_log ALTER COLUMN job_id DROP NOT NULL;

ALTER TABLE activity_log DROP CONSTRAINT activity_log_job_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE activity_log ADD COLUMN job_code text;

UPDATE activity_log al
SET job_code = j.job_id
FROM jobs j
WHERE al.job_id = j.id AND al.job_code IS NULL;

CREATE POLICY jobs_delete_depthead ON jobs FOR DELETE
  USING ((get_user_role() = 'dept_head'::user_role_enum)
    AND (department = ANY (get_user_visible_departments())));
