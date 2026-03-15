
-- Add dimension fields to external_resources
ALTER TABLE public.external_resources
  ADD COLUMN IF NOT EXISTS width_mm numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS height_mm numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS depth_mm numeric DEFAULT NULL;

-- Add coordinate and section visibility fields to budget_wall_objects
ALTER TABLE public.budget_wall_objects
  ADD COLUMN IF NOT EXISTS coord_x numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coord_y numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coord_z numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shown_in_section boolean NOT NULL DEFAULT false;
