-- Add rustic land classification and buildability assessment fields
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS rustic_land_use varchar(100);
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS rustic_land_use_source text;
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS distance_to_urban_nucleus numeric;
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS distance_to_urban_nucleus_source text;
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS nearest_urban_nucleus varchar(255);
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS authorizing_body varchar(100);
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS authorizing_body_name varchar(255);
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS buildability_assessment text;
ALTER TABLE public.urban_profiles ADD COLUMN IF NOT EXISTS buildability_requirements jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.urban_profiles.rustic_land_use IS 'Specific use classification for rustic land (e.g., Rústico ordinario, Rústico de especial protección)';
COMMENT ON COLUMN public.urban_profiles.distance_to_urban_nucleus IS 'Distance in meters to nearest urban nucleus';
COMMENT ON COLUMN public.urban_profiles.nearest_urban_nucleus IS 'Name of nearest urban nucleus';
COMMENT ON COLUMN public.urban_profiles.authorizing_body IS 'Code of authorizing body (e.g., CROTU, COTA, CUOTA)';
COMMENT ON COLUMN public.urban_profiles.authorizing_body_name IS 'Full name of regional urbanistic commission';
COMMENT ON COLUMN public.urban_profiles.buildability_assessment IS 'Summary of buildability conditions and requirements';
COMMENT ON COLUMN public.urban_profiles.buildability_requirements IS 'JSON array of specific requirements for obtaining building permit';