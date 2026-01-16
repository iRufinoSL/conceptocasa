-- Add utility/service distance fields to urban_profiles
ALTER TABLE public.urban_profiles
ADD COLUMN IF NOT EXISTS distance_to_water_supply numeric,
ADD COLUMN IF NOT EXISTS distance_to_water_supply_source text,
ADD COLUMN IF NOT EXISTS distance_to_sewage_network numeric,
ADD COLUMN IF NOT EXISTS distance_to_sewage_network_source text,
ADD COLUMN IF NOT EXISTS distance_to_electricity numeric,
ADD COLUMN IF NOT EXISTS distance_to_electricity_source text;

-- Add comments
COMMENT ON COLUMN public.urban_profiles.distance_to_water_supply IS 'Distance to nearest water supply connection in meters';
COMMENT ON COLUMN public.urban_profiles.distance_to_sewage_network IS 'Distance to municipal sewage network connection in meters';
COMMENT ON COLUMN public.urban_profiles.distance_to_electricity IS 'Distance to nearest electricity connection point in meters';