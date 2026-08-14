-- Revert Dept Head job deletion (kept BOD-only, matching how
-- customers/vendors delete already worked) — after reflection, the
-- risk of casual deletion outweighs the benefit, and the real everyday
-- scenario ("customer doesn't proceed after quotation") is better
-- served by Close Ticket below, which is reversible-ish (a status +
-- reason, not row removal) and fully auditable.
DROP POLICY IF EXISTS jobs_delete_depthead ON jobs;

-- Close Ticket: closing a job while it's still Potential or In Progress
-- (customer didn't proceed, etc.) rather than reaching Completed
-- naturally. Reuses the existing Cancel flow (status -> 'cancelled',
-- reason required) but now snapshots which stage it was closed from,
-- so Reports can break down "closed while Potential" vs "closed while
-- In Progress" vs "reached Completed" — that distinction wasn't
-- recoverable from status alone once a job flips to 'cancelled'.
ALTER TABLE jobs ADD COLUMN closed_from_status job_status_enum;
