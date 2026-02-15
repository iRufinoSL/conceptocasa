-- Add sill_height (altura sobre el suelo) to openings
ALTER TABLE public.budget_floor_plan_openings 
ADD COLUMN sill_height numeric NOT NULL DEFAULT 0;

-- Add a name for the opening type preset
COMMENT ON COLUMN public.budget_floor_plan_openings.sill_height IS 'Height from floor to bottom of opening in meters';