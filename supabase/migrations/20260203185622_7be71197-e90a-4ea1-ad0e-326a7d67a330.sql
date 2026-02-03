-- Add construction parameters and detailed spaces data
-- These are "internal" fields added by the team (not from web form)

-- 1. Construction parameters
ALTER TABLE public.project_profiles 
ADD COLUMN IF NOT EXISTS altura_habitaciones numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS espesor_paredes_externas numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS espesor_paredes_internas numeric DEFAULT NULL;

-- 2. Detailed spaces breakdown - stored as JSONB for flexibility
-- Each space will have: { name, m2, ventanas, tamaño_ventanas, tiene_puerta }
ALTER TABLE public.project_profiles 
ADD COLUMN IF NOT EXISTS espacios_detalle jsonb DEFAULT NULL;

COMMENT ON COLUMN public.project_profiles.altura_habitaciones IS 'Altura promedio de habitaciones en metros';
COMMENT ON COLUMN public.project_profiles.espesor_paredes_externas IS 'Espesor paredes externas en cm';
COMMENT ON COLUMN public.project_profiles.espesor_paredes_internas IS 'Espesor paredes internas en cm';
COMMENT ON COLUMN public.project_profiles.espacios_detalle IS 'Detalles de espacios: [{name, type, m2, num_ventanas, tamano_ventanas, tiene_puerta}]';