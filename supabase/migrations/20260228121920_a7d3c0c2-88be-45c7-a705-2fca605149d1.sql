
-- Table to persist volume layer definitions
CREATE TABLE public.budget_volume_layers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  floor_plan_id UUID NOT NULL REFERENCES public.budget_floor_plans(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES public.budget_floors(id) ON DELETE CASCADE,
  surface_type TEXT NOT NULL, -- 'suelo', 'pared_exterior', 'pared_interior', 'techo', 'cubierta_superior', 'cubierta_inferior'
  layer_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  thickness_mm INTEGER NOT NULL DEFAULT 20,
  include_non_structural BOOLEAN NOT NULL DEFAULT false, -- whether to include aleros/aceras in surface calc
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_volume_layers ENABLE ROW LEVEL SECURITY;

-- RLS policies - access follows budget access
CREATE POLICY "Users with budget access can view volume layers"
ON public.budget_volume_layers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plans fp
    WHERE fp.id = budget_volume_layers.floor_plan_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

CREATE POLICY "Users with budget access can insert volume layers"
ON public.budget_volume_layers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plans fp
    WHERE fp.id = budget_volume_layers.floor_plan_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

CREATE POLICY "Users with budget access can update volume layers"
ON public.budget_volume_layers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plans fp
    WHERE fp.id = budget_volume_layers.floor_plan_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

CREATE POLICY "Users with budget access can delete volume layers"
ON public.budget_volume_layers FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plans fp
    WHERE fp.id = budget_volume_layers.floor_plan_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_budget_volume_layers_updated_at
BEFORE UPDATE ON public.budget_volume_layers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
