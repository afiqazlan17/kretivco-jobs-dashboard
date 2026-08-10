-- Fix: log_job_updated() inserted a CASE expression ('completed' /
-- 'cancelled' / 'status_change') into activity_log.action, a column typed
-- activity_action_enum. Postgres only auto-casts bare string LITERALS to an
-- enum column, not the result of a CASE expression (it resolves to text) —
-- so every job status change raised "column action is of type
-- activity_action_enum but expression is of type text" inside the AFTER
-- UPDATE trigger, which rolled back the entire jobs UPDATE. The app's
-- optimistic local state still showed the new status until the next
-- refetch, when the real (unchanged) DB row came back — this is the "status
-- reverts to Potential after refresh" bug. supabase-js's .update() call
-- (without .select()) doesn't distinguish this from a normal successful
-- write, so it never surfaced as a client-side error either.
CREATE OR REPLACE FUNCTION log_job_updated()
RETURNS TRIGGER AS $$
DECLARE
  uname TEXT;
BEGIN
  SELECT name INTO uname FROM public.users WHERE id = auth.uid();

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value, note)
    VALUES (
      NEW.id, auth.uid(), uname,
      (CASE
        WHEN NEW.status = 'completed' THEN 'completed'
        WHEN NEW.status = 'cancelled' THEN 'cancelled'
        ELSE 'status_change'
      END)::activity_action_enum,
      'status', OLD.status::TEXT, NEW.status::TEXT,
      CASE
        WHEN NEW.status = 'completed' THEN 'Final value: RM ' || COALESCE(NEW.final_value::TEXT, '0')
        WHEN NEW.status = 'cancelled' THEN 'Job dibatalkan.'
        ELSE NULL
      END
    );
  END IF;

  IF OLD.archived IS DISTINCT FROM NEW.archived AND NEW.archived = true THEN
    INSERT INTO public.activity_log (job_id, user_id, user_name, action, note)
    VALUES (NEW.id, auth.uid(), uname, 'archived', 'Job diarkibkan.');
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.archived IS NOT DISTINCT FROM NEW.archived THEN
    IF OLD.job_type IS DISTINCT FROM NEW.job_type THEN
      INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value)
      VALUES (NEW.id, auth.uid(), uname, 'edited', 'job_type', OLD.job_type, NEW.job_type);
    END IF;
    IF OLD.pic IS DISTINCT FROM NEW.pic THEN
      INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value)
      VALUES (NEW.id, auth.uid(), uname, 'edited', 'pic', OLD.pic, NEW.pic);
    END IF;
    IF OLD.estimation_value IS DISTINCT FROM NEW.estimation_value THEN
      INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value)
      VALUES (NEW.id, auth.uid(), uname, 'edited', 'estimation_value', OLD.estimation_value::TEXT, NEW.estimation_value::TEXT);
    END IF;
    IF OLD.deadline IS DISTINCT FROM NEW.deadline THEN
      INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value)
      VALUES (NEW.id, auth.uid(), uname, 'edited', 'deadline', OLD.deadline::TEXT, NEW.deadline::TEXT);
    END IF;
    IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
      INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value)
      VALUES (NEW.id, auth.uid(), uname, 'edited', 'start_date', OLD.start_date::TEXT, NEW.start_date::TEXT);
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      INSERT INTO public.activity_log (job_id, user_id, user_name, action, field_changed, old_value, new_value)
      VALUES (NEW.id, auth.uid(), uname, 'edited', 'notes', LEFT(OLD.notes, 100), LEFT(NEW.notes, 100));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
