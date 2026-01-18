-- Añadir campos de coordenadas y URL de Google Maps a project_profiles
ALTER TABLE public.project_profiles
ADD COLUMN IF NOT EXISTS coordenadas_google_maps TEXT,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- Comentarios para documentar los campos
COMMENT ON COLUMN public.project_profiles.coordenadas_google_maps IS 'Coordenadas de Google Maps (latitud, longitud)';
COMMENT ON COLUMN public.project_profiles.google_maps_url IS 'URL directa de Google Maps';