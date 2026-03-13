
-- 1) Table for dynamic object types per budget
CREATE TABLE public.budget_object_type_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(budget_id, name)
);

ALTER TABLE public.budget_object_type_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with budget access can view object type catalog"
  ON public.budget_object_type_catalog FOR SELECT TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can insert object type catalog"
  ON public.budget_object_type_catalog FOR INSERT TO authenticated
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can delete object type catalog"
  ON public.budget_object_type_catalog FOR DELETE TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- 2) Seed default types for existing budgets
INSERT INTO public.budget_object_type_catalog (budget_id, name)
SELECT p.id, t.name
FROM public.presupuestos p
CROSS JOIN (VALUES ('Material'),('Aislamiento'),('Revestimiento'),('Estructura'),('Instalación'),('Acabado'),('Otro')) AS t(name)
ON CONFLICT DO NOTHING;

-- 3) Add unit_measure to object templates
ALTER TABLE public.budget_object_templates ADD COLUMN IF NOT EXISTS unit_measure text DEFAULT 'ud';
