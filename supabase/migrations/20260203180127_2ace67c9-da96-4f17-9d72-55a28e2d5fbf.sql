-- Add inclinacion_terreno column to project_profiles to store terrain flatness data
ALTER TABLE public.project_profiles 
ADD COLUMN IF NOT EXISTS inclinacion_terreno TEXT;