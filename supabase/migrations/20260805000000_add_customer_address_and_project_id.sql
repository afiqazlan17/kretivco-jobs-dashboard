-- Adds customer address fields (so quotation/invoice addresses can be
-- pre-filled from the customer record instead of re-typed each time) and a
-- project_id column on jobs (groups sibling jobs created together across
-- multiple departments in one Create New Job submission).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS project_id text;

CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON public.jobs (project_id);
