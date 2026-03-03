
-- Add housing profile JSONB column to projects table
-- This stores the construction profile data (from HousingProfileForm)
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS housing_profile JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.projects.housing_profile IS 'Stores housing construction profile data: numPlantas, habitaciones, espacios, estilo, terreno, etc.';
