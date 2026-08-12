-- Per-department reusable item catalog (name + description only — no
-- price, since pricing always varies per job). Uniqueness is
-- case-insensitive per department so "Business Card" and "business card"
-- dedupe to the same entry.
CREATE TABLE public.item_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department department_enum NOT NULL,
  item_name text NOT NULL,
  description text,
  usage_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);

CREATE UNIQUE INDEX item_library_unique_name_per_dept ON public.item_library (department, lower(item_name));

ALTER TABLE public.item_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY item_library_select_all ON public.item_library FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY item_library_insert_all ON public.item_library FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY item_library_update_bod_depthead ON public.item_library FOR UPDATE USING (get_user_role() = ANY (ARRAY['bod'::user_role_enum, 'dept_head'::user_role_enum]));
CREATE POLICY item_library_delete_bod ON public.item_library FOR DELETE USING (get_user_role() = 'bod'::user_role_enum);
