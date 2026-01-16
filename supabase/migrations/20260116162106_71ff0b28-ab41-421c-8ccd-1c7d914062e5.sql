-- Add new fields for sectoral restrictions (afecciones sectoriales)
-- These capture specific distance requirements from infrastructure and protected elements

ALTER TABLE public.urban_profiles
  ADD COLUMN IF NOT EXISTS min_distance_cemetery NUMERIC,
  ADD COLUMN IF NOT EXISTS min_distance_cemetery_source TEXT,
  ADD COLUMN IF NOT EXISTS min_distance_power_lines NUMERIC,
  ADD COLUMN IF NOT EXISTS min_distance_power_lines_source TEXT,
  ADD COLUMN IF NOT EXISTS min_distance_water_courses NUMERIC,
  ADD COLUMN IF NOT EXISTS min_distance_water_courses_source TEXT,
  ADD COLUMN IF NOT EXISTS min_distance_railway NUMERIC,
  ADD COLUMN IF NOT EXISTS min_distance_railway_source TEXT,
  ADD COLUMN IF NOT EXISTS min_distance_pipeline NUMERIC,
  ADD COLUMN IF NOT EXISTS min_distance_pipeline_source TEXT,
  ADD COLUMN IF NOT EXISTS max_built_surface NUMERIC,
  ADD COLUMN IF NOT EXISTS max_built_surface_source TEXT,
  ADD COLUMN IF NOT EXISTS max_floors_source TEXT,
  ADD COLUMN IF NOT EXISTS fence_setback NUMERIC,
  ADD COLUMN IF NOT EXISTS fence_setback_source TEXT,
  ADD COLUMN IF NOT EXISTS access_width NUMERIC,
  ADD COLUMN IF NOT EXISTS access_width_source TEXT,
  ADD COLUMN IF NOT EXISTS is_divisible BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_divisible_source TEXT,
  ADD COLUMN IF NOT EXISTS affected_by_power_lines BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS affected_by_cemetery BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS affected_by_water_courses BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sectoral_restrictions JSONB DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.urban_profiles.min_distance_cemetery IS 'Distancia mínima al cementerio más cercano (metros)';
COMMENT ON COLUMN public.urban_profiles.min_distance_power_lines IS 'Distancia mínima a líneas de alta tensión (metros)';
COMMENT ON COLUMN public.urban_profiles.min_distance_water_courses IS 'Distancia mínima a cauces de agua (metros)';
COMMENT ON COLUMN public.urban_profiles.min_distance_railway IS 'Distancia mínima a vías férreas (metros)';
COMMENT ON COLUMN public.urban_profiles.min_distance_pipeline IS 'Distancia mínima a gasoductos/oleoductos (metros)';
COMMENT ON COLUMN public.urban_profiles.max_built_surface IS 'Superficie máxima construida permitida (m²)';
COMMENT ON COLUMN public.urban_profiles.fence_setback IS 'Retranqueo del cerramiento al eje de la vía (metros)';
COMMENT ON COLUMN public.urban_profiles.access_width IS 'Anchura mínima del acceso rodado (metros)';
COMMENT ON COLUMN public.urban_profiles.is_divisible IS 'Si la parcela es divisible según normativa';
COMMENT ON COLUMN public.urban_profiles.sectoral_restrictions IS 'Afecciones sectoriales adicionales en formato JSON';