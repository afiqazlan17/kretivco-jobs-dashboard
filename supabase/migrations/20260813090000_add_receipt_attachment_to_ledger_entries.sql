-- Receipt attachment for expense/vendor-cost ledger entries — reuses the
-- existing job-attachments storage bucket (path stored here, file itself
-- lives in Storage), same pattern as job note/artwork attachments.
ALTER TABLE public.ledger_entries
  ADD COLUMN receipt_path text,
  ADD COLUMN receipt_name text;
