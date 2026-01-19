-- Add project_id column to crm_opportunities to link opportunities with projects
ALTER TABLE public.crm_opportunities 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_project_id ON public.crm_opportunities(project_id);