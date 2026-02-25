-- Add ridge_height column for bajo cubierta roof configuration
-- Allows defining either slope angle OR ridge height (free height from base to peak)
ALTER TABLE public.budget_floor_plans 
ADD COLUMN IF NOT EXISTS ridge_height numeric DEFAULT NULL;

COMMENT ON COLUMN public.budget_floor_plans.ridge_height IS 'Altura libre desde la base del hastial hasta la cumbrera (metros). Alternativa a roof_slope_percent.';