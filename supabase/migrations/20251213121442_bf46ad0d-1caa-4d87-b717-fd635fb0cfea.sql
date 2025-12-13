-- Add missing fields to presupuestos table
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS provincia text,
ADD COLUMN IF NOT EXISTS coordenadas_lat numeric,
ADD COLUMN IF NOT EXISTS coordenadas_lng numeric;

-- Update existing records with sample data
UPDATE public.presupuestos SET provincia = 'Madrid' WHERE poblacion = 'Madrid';
UPDATE public.presupuestos SET provincia = 'Madrid' WHERE poblacion = 'Navacerrada';
UPDATE public.presupuestos SET provincia = 'Barcelona' WHERE poblacion = 'Barcelona';
UPDATE public.presupuestos SET provincia = 'Málaga' WHERE poblacion = 'Marbella';