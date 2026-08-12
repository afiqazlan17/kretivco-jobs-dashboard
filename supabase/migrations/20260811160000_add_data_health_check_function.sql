-- Data health-check: a single function scanning for the anomaly classes
-- found in production so far (compounded address text, jobs in progress
-- with no PIC, duplicate unreversed ledger entries per job, self-referencing
-- ledger entries, completed jobs missing a final value, duplicate user
-- emails). Runnable on demand (select * from run_health_check();) and on a
-- weekly schedule.
CREATE OR REPLACE FUNCTION public.run_health_check()
RETURNS TABLE(category text, severity text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'customer_address_anomaly', 'warning',
    format('Customer %s (%s): address_line_2 unusually long (%s chars) — possible duplication', customer_id, name, length(address_line_2))
  FROM public.customers WHERE length(address_line_2) > 100
  UNION ALL
  SELECT 'customer_address_anomaly', 'warning',
    format('Customer %s (%s): address_line_1 unusually long (%s chars) — possible duplication', customer_id, name, length(address_line_1))
  FROM public.customers WHERE length(address_line_1) > 100
  UNION ALL
  SELECT 'customer_missing_company_info', 'info',
    format('Customer %s (%s): marked as company but missing %s', customer_id, name,
      CASE WHEN company IS NULL AND ssm_number IS NULL THEN 'company name and SSM number'
           WHEN company IS NULL THEN 'company name' ELSE 'SSM number' END)
  FROM public.customers WHERE customer_type = 'company' AND (company IS NULL OR ssm_number IS NULL)
  UNION ALL
  SELECT 'job_in_progress_no_pic', 'critical',
    format('Job %s: status is in_progress but has no PIC assigned', job_id)
  FROM public.jobs WHERE status = 'in_progress' AND (pic IS NULL OR pic = '') AND NOT archived
  UNION ALL
  SELECT 'job_completed_no_value', 'warning',
    format('Job %s: marked completed but final_value is empty (estimation was RM%s)', job_id, estimation_value)
  FROM public.jobs WHERE status = 'completed' AND (final_value IS NULL OR final_value = 0) AND estimation_value > 0
  UNION ALL
  SELECT 'job_deadline_before_start', 'warning',
    format('Job %s: deadline (%s) is before its start date (%s)', job_id, deadline, start_date)
  FROM public.jobs WHERE deadline IS NOT NULL AND start_date IS NOT NULL AND deadline < start_date
  UNION ALL
  SELECT 'ledger_duplicate_unreversed', 'critical',
    format('Job %s has %s unreversed %s entries — should never be more than 1', job_id, cnt, type)
  FROM (SELECT job_id, type, count(*) AS cnt FROM public.ledger_entries WHERE reversed = false AND type IN ('invoice', 'receipt') GROUP BY job_id, type HAVING count(*) > 1) dup
  UNION ALL
  SELECT 'ledger_self_referencing_entry', 'critical',
    format('Ledger entry %s (job %s): debit and credit account are both %s', id, job_id, debit_account)
  FROM public.ledger_entries WHERE debit_account = credit_account
  UNION ALL
  SELECT 'user_duplicate_email', 'warning',
    format('%s user accounts share the email %s', cnt, email)
  FROM (SELECT lower(email) AS email, count(*) AS cnt FROM public.users GROUP BY lower(email) HAVING count(*) > 1) dup
$$;
