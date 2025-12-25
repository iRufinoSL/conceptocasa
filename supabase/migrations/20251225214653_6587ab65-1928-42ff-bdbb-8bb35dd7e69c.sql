-- Add comparativa_opciones field to presupuestos table for CUÁNTO section
ALTER TABLE public.presupuestos
ADD COLUMN IF NOT EXISTS comparativa_opciones TEXT;