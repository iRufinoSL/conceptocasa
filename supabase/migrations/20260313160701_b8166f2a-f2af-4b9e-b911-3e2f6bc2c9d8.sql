
CREATE TABLE public.budget_object_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name text NOT NULL,
  material_type text,
  technical_description text,
  width_mm numeric,
  height_mm numeric,
  thickness_mm numeric,
  purchase_price_vat_included numeric DEFAULT 0,
  vat_included_percent numeric DEFAULT 21,
  safety_margin_percent numeric DEFAULT 0,
  sales_margin_percent numeric DEFAULT 0,
  object_type text NOT NULL DEFAULT 'material',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_object_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with budget access can view object templates"
  ON public.budget_object_templates FOR SELECT TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can insert object templates"
  ON public.budget_object_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can update object templates"
  ON public.budget_object_templates FOR UPDATE TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can delete object templates"
  ON public.budget_object_templates FOR DELETE TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- Add template_id reference to budget_wall_objects so placed objects can reference a template
ALTER TABLE public.budget_wall_objects ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.budget_object_templates(id) ON DELETE SET NULL;
