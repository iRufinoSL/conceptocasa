
-- Add new columns for volume layer enhancements
ALTER TABLE public.budget_volume_layers
  ADD COLUMN IF NOT EXISTS measurement_type text NOT NULL DEFAULT 'area',
  ADD COLUMN IF NOT EXISTS section_width_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS section_height_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS orientation text NULL,
  ADD COLUMN IF NOT EXISTS spacing_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS group_tag text NULL,
  ADD COLUMN IF NOT EXISTS extra_surface_name text NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.budget_volume_layers.measurement_type IS 'area (m²) or linear (ml)';
COMMENT ON COLUMN public.budget_volume_layers.orientation IS 'parallel_ridge or crossed_ridge for linear layers';
COMMENT ON COLUMN public.budget_volume_layers.group_tag IS 'Layers with same group_tag share thickness (max of group)';
COMMENT ON COLUMN public.budget_volume_layers.extra_surface_name IS 'Custom label for non-structural surface toggle (e.g. Aleros, Aceras)';
