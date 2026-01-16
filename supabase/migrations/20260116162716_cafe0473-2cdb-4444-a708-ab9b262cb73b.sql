-- Add sewage/sanitation fields to urban_profiles
ALTER TABLE public.urban_profiles
ADD COLUMN IF NOT EXISTS has_municipal_sewage boolean,
ADD COLUMN IF NOT EXISTS has_municipal_sewage_source text,
ADD COLUMN IF NOT EXISTS requires_septic_tank boolean,
ADD COLUMN IF NOT EXISTS septic_tank_regulations text,
ADD COLUMN IF NOT EXISTS septic_tank_min_distance numeric,
ADD COLUMN IF NOT EXISTS septic_tank_min_distance_source text;

-- Add comments
COMMENT ON COLUMN public.urban_profiles.has_municipal_sewage IS 'Whether municipal sewage network is available';
COMMENT ON COLUMN public.urban_profiles.requires_septic_tank IS 'Whether septic tank installation is required';
COMMENT ON COLUMN public.urban_profiles.septic_tank_regulations IS 'Specific regulations for septic tank installation';
COMMENT ON COLUMN public.urban_profiles.septic_tank_min_distance IS 'Minimum distance from septic tank to buildings/wells in meters';