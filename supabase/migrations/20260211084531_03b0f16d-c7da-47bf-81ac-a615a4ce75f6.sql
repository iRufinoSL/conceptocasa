
-- Add terreno (land) fields to presupuestos
ALTER TABLE public.presupuestos 
  ADD COLUMN IF NOT EXISTS terreno_m2 numeric,
  ADD COLUMN IF NOT EXISTS terreno_width numeric,
  ADD COLUMN IF NOT EXISTS terreno_length numeric;

-- Add vivienda-level estimated surface
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS estimated_surface_m2 numeric;

-- Add vivienda-level default properties  
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS default_room_height numeric DEFAULT 2.7,
  ADD COLUMN IF NOT EXISTS default_external_wall_thickness numeric DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS default_internal_wall_thickness numeric DEFAULT 0.15;
