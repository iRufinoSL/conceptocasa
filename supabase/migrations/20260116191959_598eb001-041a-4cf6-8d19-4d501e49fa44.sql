
-- Add new sectoral affection fields to urban_profiles
ALTER TABLE public.urban_profiles
ADD COLUMN IF NOT EXISTS min_distance_coast NUMERIC,
ADD COLUMN IF NOT EXISTS min_distance_coast_source TEXT,
ADD COLUMN IF NOT EXISTS min_distance_forest NUMERIC,
ADD COLUMN IF NOT EXISTS min_distance_forest_source TEXT,
ADD COLUMN IF NOT EXISTS min_distance_airport NUMERIC,
ADD COLUMN IF NOT EXISTS min_distance_airport_source TEXT,
ADD COLUMN IF NOT EXISTS max_height_airport NUMERIC,
ADD COLUMN IF NOT EXISTS max_height_airport_source TEXT,
ADD COLUMN IF NOT EXISTS affected_by_coast BOOLEAN,
ADD COLUMN IF NOT EXISTS affected_by_airport BOOLEAN,
ADD COLUMN IF NOT EXISTS affected_by_forest BOOLEAN,
ADD COLUMN IF NOT EXISTS affected_by_heritage BOOLEAN,
ADD COLUMN IF NOT EXISTS affected_by_livestock_route BOOLEAN;

COMMENT ON COLUMN public.urban_profiles.min_distance_coast IS 'Distancia mínima a la costa (Ley de Costas)';
COMMENT ON COLUMN public.urban_profiles.min_distance_forest IS 'Distancia mínima a masa forestal/monte';
COMMENT ON COLUMN public.urban_profiles.min_distance_airport IS 'Distancia mínima o restricción aeroportuaria (AESA)';
COMMENT ON COLUMN public.urban_profiles.max_height_airport IS 'Altura máxima permitida por servidumbre aeronáutica';
COMMENT ON COLUMN public.urban_profiles.affected_by_coast IS 'Afectado por Ley de Costas';
COMMENT ON COLUMN public.urban_profiles.affected_by_airport IS 'Afectado por servidumbre aeronáutica (AESA)';
COMMENT ON COLUMN public.urban_profiles.affected_by_forest IS 'Afectado por normativa forestal/montes';
COMMENT ON COLUMN public.urban_profiles.affected_by_heritage IS 'Afectado por patrimonio (BIC, zona arqueológica)';
COMMENT ON COLUMN public.urban_profiles.affected_by_livestock_route IS 'Afectado por vía pecuaria';
