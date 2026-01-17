-- Add urban report fields to urban_profiles
ALTER TABLE public.urban_profiles
ADD COLUMN IF NOT EXISTS permitted_uses jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS compatible_uses jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS prohibited_uses jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS building_typology text,
ADD COLUMN IF NOT EXISTS building_typology_source text,
ADD COLUMN IF NOT EXISTS implantation_conditions text,
ADD COLUMN IF NOT EXISTS implantation_conditions_source text,
ADD COLUMN IF NOT EXISTS consulted_sources jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS soil_category text,
ADD COLUMN IF NOT EXISTS soil_category_source text,
ADD COLUMN IF NOT EXISTS principal_use text,
ADD COLUMN IF NOT EXISTS principal_use_source text,
ADD COLUMN IF NOT EXISTS road_setback numeric,
ADD COLUMN IF NOT EXISTS road_setback_source text,
ADD COLUMN IF NOT EXISTS municipal_road_setback numeric,
ADD COLUMN IF NOT EXISTS municipal_road_setback_source text,
ADD COLUMN IF NOT EXISTS highway_setback numeric,
ADD COLUMN IF NOT EXISTS highway_setback_source text;

-- Add comments for documentation
COMMENT ON COLUMN public.urban_profiles.permitted_uses IS 'Array of permitted land uses extracted from urban planning documents';
COMMENT ON COLUMN public.urban_profiles.compatible_uses IS 'Array of compatible/secondary uses allowed';
COMMENT ON COLUMN public.urban_profiles.prohibited_uses IS 'Array of explicitly prohibited uses';
COMMENT ON COLUMN public.urban_profiles.building_typology IS 'Type of building allowed (unifamiliar aislada, adosada, etc.)';
COMMENT ON COLUMN public.urban_profiles.implantation_conditions IS 'Special conditions for building placement';
COMMENT ON COLUMN public.urban_profiles.consulted_sources IS 'Array of sources consulted with name, type and url';
COMMENT ON COLUMN public.urban_profiles.soil_category IS 'Specific soil category (Núcleo Rural, Urbano Consolidado, etc.)';
COMMENT ON COLUMN public.urban_profiles.principal_use IS 'Main permitted use (Residencial, Industrial, etc.)';
COMMENT ON COLUMN public.urban_profiles.road_setback IS 'Minimum distance to general roads in meters';
COMMENT ON COLUMN public.urban_profiles.municipal_road_setback IS 'Minimum distance to municipal roads in meters';
COMMENT ON COLUMN public.urban_profiles.highway_setback IS 'Minimum distance to highways/autovías in meters';