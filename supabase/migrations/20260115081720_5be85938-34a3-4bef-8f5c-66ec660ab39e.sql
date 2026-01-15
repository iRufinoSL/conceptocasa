-- Add new columns to budget_tasks for extended functionality
ALTER TABLE public.budget_tasks 
  ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES public.budget_activity_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- Make activity_id nullable (tasks can exist without activity)
ALTER TABLE public.budget_tasks ALTER COLUMN activity_id DROP NOT NULL;

-- Rename start_date to target_date if it exists and target_date doesn't
UPDATE public.budget_tasks SET target_date = start_date WHERE target_date IS NULL AND start_date IS NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_tasks_budget_id ON public.budget_tasks(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_tasks_activity_id ON public.budget_tasks(activity_id);
CREATE INDEX IF NOT EXISTS idx_budget_tasks_target_date ON public.budget_tasks(target_date);
CREATE INDEX IF NOT EXISTS idx_budget_tasks_status ON public.budget_tasks(status);

-- Enable RLS if not already enabled
ALTER TABLE public.budget_tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Admins can manage all tasks" ON public.budget_tasks;
DROP POLICY IF EXISTS "Colaboradores can view and manage tasks" ON public.budget_tasks;
DROP POLICY IF EXISTS "Users can view tasks for their budgets" ON public.budget_tasks;
DROP POLICY IF EXISTS "Admin full access to budget_tasks" ON public.budget_tasks;
DROP POLICY IF EXISTS "Colaborador access to budget_tasks" ON public.budget_tasks;

-- Create new RLS policies
CREATE POLICY "Admins can manage all tasks"
ON public.budget_tasks
FOR ALL
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can manage tasks"
ON public.budget_tasks
FOR ALL
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

CREATE POLICY "Users can view their budget tasks"
ON public.budget_tasks
FOR SELECT
USING (
  budget_id IS NULL 
  OR public.has_presupuesto_access(auth.uid(), budget_id)
);

-- Enable realtime for tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_tasks;