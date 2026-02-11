
-- Create budget_floors table for multi-story support
CREATE TABLE public.budget_floors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  floor_plan_id UUID NOT NULL REFERENCES public.budget_floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'planta_1', -- planta_1, planta_2, bajo_cubierta
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_floors ENABLE ROW LEVEL SECURITY;

-- RLS policies: access through floor_plan -> budget -> presupuesto
CREATE POLICY "Users with budget access can view floors"
  ON public.budget_floors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plans fp
      WHERE fp.id = budget_floors.floor_plan_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

CREATE POLICY "Users with budget access can insert floors"
  ON public.budget_floors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plans fp
      WHERE fp.id = budget_floors.floor_plan_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

CREATE POLICY "Users with budget access can update floors"
  ON public.budget_floors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plans fp
      WHERE fp.id = budget_floors.floor_plan_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

CREATE POLICY "Users with budget access can delete floors"
  ON public.budget_floors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plans fp
      WHERE fp.id = budget_floors.floor_plan_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

-- Add floor_id to rooms
ALTER TABLE public.budget_floor_plan_rooms
  ADD COLUMN floor_id UUID REFERENCES public.budget_floors(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER update_budget_floors_updated_at
  BEFORE UPDATE ON public.budget_floors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
