ALTER TABLE public.budget_floor_plan_walls
  ADD COLUMN IF NOT EXISTS elevation_group text DEFAULT NULL;