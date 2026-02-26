
-- 1. Add per-room wall thickness overrides to budget_floor_plan_rooms
ALTER TABLE public.budget_floor_plan_rooms
  ADD COLUMN ext_wall_thickness numeric DEFAULT NULL,
  ADD COLUMN int_wall_thickness numeric DEFAULT NULL;

-- 2. Create wall layers table for multi-layer wall composition
CREATE TABLE public.budget_floor_plan_wall_layers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wall_id UUID NOT NULL REFERENCES public.budget_floor_plan_walls(id) ON DELETE CASCADE,
  layer_type TEXT NOT NULL DEFAULT 'bloque', -- bloque, revoco, aislamiento, placa_yeso, etc.
  layer_order INTEGER NOT NULL DEFAULT 0,    -- 0 = innermost, higher = more exterior
  thickness_mm NUMERIC NOT NULL DEFAULT 0,
  material TEXT,
  is_core BOOLEAN NOT NULL DEFAULT false,    -- true = this is the structural core (block)
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_floor_plan_wall_layers ENABLE ROW LEVEL SECURITY;

-- RLS policies: budget-scoped access via wall -> room -> floor_plan -> budget
CREATE POLICY "Users can view wall layers for accessible budgets"
ON public.budget_floor_plan_wall_layers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plan_walls w
    JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
    JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE w.id = budget_floor_plan_wall_layers.wall_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

CREATE POLICY "Users can insert wall layers for accessible budgets"
ON public.budget_floor_plan_wall_layers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plan_walls w
    JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
    JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE w.id = budget_floor_plan_wall_layers.wall_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

CREATE POLICY "Users can update wall layers for accessible budgets"
ON public.budget_floor_plan_wall_layers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plan_walls w
    JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
    JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE w.id = budget_floor_plan_wall_layers.wall_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

CREATE POLICY "Users can delete wall layers for accessible budgets"
ON public.budget_floor_plan_wall_layers FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plan_walls w
    JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
    JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE w.id = budget_floor_plan_wall_layers.wall_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);

-- Index for performance
CREATE INDEX idx_wall_layers_wall_id ON public.budget_floor_plan_wall_layers(wall_id);
