-- Add tags column to crm_opportunities for labels like "Perfil de vivienda"
ALTER TABLE public.crm_opportunities 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add index for better tag search performance
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_tags ON public.crm_opportunities USING GIN(tags);