-- Vendor / subcontractor master list (mirrors customers table shape).
-- Powers the Vendors directory and the job-level Vendor Cost section.

CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text UNIQUE NOT NULL,
  name text NOT NULL,
  company text,
  category text NOT NULL DEFAULT 'other',
  phone text,
  email text,
  bank_name text,
  bank_account text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);

COMMENT ON TABLE public.vendors IS 'Vendor/subcontractor master list. KVE-XXX IDs are globally unique, no annual reset.';

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_select_all ON public.vendors
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY vendors_insert_all ON public.vendors
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY vendors_update_bod_depthead ON public.vendors
  FOR UPDATE USING (get_user_role() = ANY (ARRAY['bod'::user_role_enum, 'dept_head'::user_role_enum]));

CREATE POLICY vendors_delete_bod ON public.vendors
  FOR DELETE USING (get_user_role() = 'bod'::user_role_enum);
