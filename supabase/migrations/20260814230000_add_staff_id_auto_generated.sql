-- Auto-generated Staff ID (KCM001, KCM002, ...) for every user row.
CREATE SEQUENCE IF NOT EXISTS staff_id_seq;

ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id text UNIQUE;

CREATE OR REPLACE FUNCTION assign_staff_id() RETURNS trigger AS $$
BEGIN
  IF NEW.staff_id IS NULL THEN
    NEW.staff_id := 'KCM' || LPAD(nextval('staff_id_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_staff_id ON users;
CREATE TRIGGER trg_assign_staff_id BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION assign_staff_id();

-- Backfill existing users in signup order.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM users ORDER BY created_at ASC LOOP
    UPDATE users SET staff_id = 'KCM' || LPAD(nextval('staff_id_seq')::text, 3, '0') WHERE id = r.id;
  END LOOP;
END;
$$;
