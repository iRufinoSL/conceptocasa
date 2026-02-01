-- Add google_maps_url field to presupuestos table
-- This stores the Google Maps URL from the Urban Profile section
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- Add address field for postal address in presupuestos
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS direccion TEXT;

COMMENT ON COLUMN public.presupuestos.google_maps_url IS 'Google Maps URL from the Urban Profile section for the construction site';
COMMENT ON COLUMN public.presupuestos.direccion IS 'Postal address of the construction site';