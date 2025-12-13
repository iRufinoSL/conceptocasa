-- Add project_id column to presupuestos table to link with projects
ALTER TABLE public.presupuestos 
ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_presupuestos_project_id ON public.presupuestos(project_id);