-- Añadir campos de coordenadas y parámetros urbanísticos con fuentes legales a urban_profiles
ALTER TABLE public.urban_profiles

-- Coordenadas Google Maps
ADD COLUMN IF NOT EXISTS google_maps_lat NUMERIC,
ADD COLUMN IF NOT EXISTS google_maps_lng NUMERIC,
ADD COLUMN IF NOT EXISTS coordinates_source TEXT,

-- Volumen máximo de edificación
ADD COLUMN IF NOT EXISTS max_buildable_volume NUMERIC,
ADD COLUMN IF NOT EXISTS max_buildable_volume_source TEXT,

-- Altura máxima (ya existe max_height, añadimos fuente)
ADD COLUMN IF NOT EXISTS max_height_source TEXT,

-- Distancias mínimas a colindantes
ADD COLUMN IF NOT EXISTS min_distance_neighbors NUMERIC,
ADD COLUMN IF NOT EXISTS min_distance_neighbors_source TEXT,

-- Distancias a caminos o carreteras
ADD COLUMN IF NOT EXISTS min_distance_roads NUMERIC,
ADD COLUMN IF NOT EXISTS min_distance_roads_source TEXT,

-- Distancias a taludes
ADD COLUMN IF NOT EXISTS min_distance_slopes NUMERIC,
ADD COLUMN IF NOT EXISTS min_distance_slopes_source TEXT,

-- Fuentes legales para campos existentes
ADD COLUMN IF NOT EXISTS front_setback_source TEXT,
ADD COLUMN IF NOT EXISTS side_setback_source TEXT,
ADD COLUMN IF NOT EXISTS rear_setback_source TEXT,
ADD COLUMN IF NOT EXISTS buildability_index_source TEXT,
ADD COLUMN IF NOT EXISTS max_occupation_source TEXT,

-- Campo para otras mediciones adicionales con fuentes
ADD COLUMN IF NOT EXISTS additional_restrictions JSONB DEFAULT '[]'::jsonb;

-- Comentarios para documentar los campos
COMMENT ON COLUMN public.urban_profiles.google_maps_lat IS 'Latitud para Google Maps';
COMMENT ON COLUMN public.urban_profiles.google_maps_lng IS 'Longitud para Google Maps';
COMMENT ON COLUMN public.urban_profiles.coordinates_source IS 'Fuente legal de las coordenadas';
COMMENT ON COLUMN public.urban_profiles.max_buildable_volume IS 'Volumen máximo de edificación en m³';
COMMENT ON COLUMN public.urban_profiles.max_buildable_volume_source IS 'Fuente legal del volumen máximo';
COMMENT ON COLUMN public.urban_profiles.max_height_source IS 'Fuente legal de la altura máxima';
COMMENT ON COLUMN public.urban_profiles.min_distance_neighbors IS 'Distancia mínima a colindantes en metros';
COMMENT ON COLUMN public.urban_profiles.min_distance_neighbors_source IS 'Fuente legal de distancia a colindantes';
COMMENT ON COLUMN public.urban_profiles.min_distance_roads IS 'Distancia mínima a caminos/carreteras en metros';
COMMENT ON COLUMN public.urban_profiles.min_distance_roads_source IS 'Fuente legal de distancia a vías';
COMMENT ON COLUMN public.urban_profiles.min_distance_slopes IS 'Distancia mínima a taludes en metros';
COMMENT ON COLUMN public.urban_profiles.min_distance_slopes_source IS 'Fuente legal de distancia a taludes';
COMMENT ON COLUMN public.urban_profiles.additional_restrictions IS 'Array de restricciones adicionales con valor, unidad y fuente';