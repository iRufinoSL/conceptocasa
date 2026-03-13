
ALTER TABLE public.budget_wall_objects
  ADD COLUMN IF NOT EXISTS width_mm numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS height_mm numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS position_x numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sill_height numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS distance_to_wall numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.external_resources(id) ON DELETE SET NULL DEFAULT NULL;
