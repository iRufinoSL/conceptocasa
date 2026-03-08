
CREATE TABLE public.budget_wall_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wall_id UUID REFERENCES public.budget_floor_plan_walls(id) ON DELETE CASCADE NOT NULL,
  layer_order INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  object_type TEXT NOT NULL DEFAULT 'material',
  is_core BOOLEAN NOT NULL DEFAULT false,
  surface_m2 NUMERIC,
  volume_m3 NUMERIC,
  length_ml NUMERIC,
  visual_pattern TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_wall_objects ENABLE ROW LEVEL SECURITY;

-- RLS: Access through wall → room → floor_plan → budget chain
CREATE POLICY "Users can view wall objects for accessible budgets"
  ON public.budget_wall_objects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plan_walls w
      JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
      JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
      WHERE w.id = budget_wall_objects.wall_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

CREATE POLICY "Users can insert wall objects for accessible budgets"
  ON public.budget_wall_objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plan_walls w
      JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
      JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
      WHERE w.id = budget_wall_objects.wall_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

CREATE POLICY "Users can update wall objects for accessible budgets"
  ON public.budget_wall_objects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plan_walls w
      JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
      JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
      WHERE w.id = budget_wall_objects.wall_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );

CREATE POLICY "Users can delete wall objects for accessible budgets"
  ON public.budget_wall_objects
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_floor_plan_walls w
      JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
      JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
      WHERE w.id = budget_wall_objects.wall_id
      AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
    )
  );
