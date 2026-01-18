-- Add missing columns for complete urban certificate data

-- Soil category source (may already exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'soil_category_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN soil_category_source text;
  END IF;
END $$;

-- Principal use and uses
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'principal_use') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN principal_use text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'principal_use_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN principal_use_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'permitted_uses') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN permitted_uses jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'compatible_uses') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN compatible_uses jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'prohibited_uses') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN prohibited_uses jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Building typology
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'building_typology') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN building_typology text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'building_typology_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN building_typology_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'implantation_conditions') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN implantation_conditions text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'implantation_conditions_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN implantation_conditions_source text;
  END IF;
END $$;

-- Consulted sources
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'consulted_sources') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN consulted_sources jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Road setbacks
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'road_setback') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN road_setback numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'road_setback_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN road_setback_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'municipal_road_setback') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN municipal_road_setback numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'municipal_road_setback_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN municipal_road_setback_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'highway_setback') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN highway_setback numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'highway_setback_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN highway_setback_source text;
  END IF;
END $$;

-- Coastal and forest restrictions
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'min_distance_coast') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN min_distance_coast numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'min_distance_coast_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN min_distance_coast_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'min_distance_forest') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN min_distance_forest numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'min_distance_forest_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN min_distance_forest_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'min_distance_airport') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN min_distance_airport numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'min_distance_airport_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN min_distance_airport_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'max_height_airport') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN max_height_airport numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'max_height_airport_source') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN max_height_airport_source text;
  END IF;
END $$;

-- Additional affected_by flags
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'affected_by_coast') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN affected_by_coast boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'affected_by_airport') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN affected_by_airport boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'affected_by_forest') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN affected_by_forest boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'affected_by_heritage') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN affected_by_heritage boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'urban_profiles' AND column_name = 'affected_by_livestock_route') THEN
    ALTER TABLE public.urban_profiles ADD COLUMN affected_by_livestock_route boolean;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.urban_profiles.principal_use IS 'Main permitted use (Residencial, Industrial, etc.)';
COMMENT ON COLUMN public.urban_profiles.permitted_uses IS 'Array of explicitly permitted land uses';
COMMENT ON COLUMN public.urban_profiles.compatible_uses IS 'Array of compatible/secondary uses allowed';
COMMENT ON COLUMN public.urban_profiles.prohibited_uses IS 'Array of explicitly prohibited uses';
COMMENT ON COLUMN public.urban_profiles.building_typology IS 'Type of building allowed (unifamiliar aislada, adosada, etc.)';
COMMENT ON COLUMN public.urban_profiles.implantation_conditions IS 'Special conditions for building placement';
COMMENT ON COLUMN public.urban_profiles.consulted_sources IS 'Array of sources consulted with name, type and url';