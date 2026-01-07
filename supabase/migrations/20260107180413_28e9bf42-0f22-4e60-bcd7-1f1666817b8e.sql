-- Add fecha_ideal_finalizacion column to project_profiles
ALTER TABLE public.project_profiles 
ADD COLUMN IF NOT EXISTS fecha_ideal_finalizacion DATE;