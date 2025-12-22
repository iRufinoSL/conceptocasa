-- Add archived column to presupuestos table
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Add archived column to projects table  
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for better performance on archived queries
CREATE INDEX IF NOT EXISTS idx_presupuestos_archived ON public.presupuestos(archived);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON public.projects(archived);