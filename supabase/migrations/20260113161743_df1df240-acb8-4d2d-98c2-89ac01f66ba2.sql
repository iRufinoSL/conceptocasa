-- Create junction table for email-budget many-to-many relationship
CREATE TABLE public.email_budget_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email_id, budget_id)
);

-- Enable RLS
ALTER TABLE public.email_budget_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view email budget assignments" 
ON public.email_budget_assignments 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and colaboradores can manage email budget assignments" 
ON public.email_budget_assignments 
FOR ALL 
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- Create indexes for better performance
CREATE INDEX idx_email_budget_assignments_email_id ON public.email_budget_assignments(email_id);
CREATE INDEX idx_email_budget_assignments_budget_id ON public.email_budget_assignments(budget_id);

-- Create junction table for email-project many-to-many relationship
CREATE TABLE public.email_project_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email_id, project_id)
);

-- Enable RLS
ALTER TABLE public.email_project_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view email project assignments" 
ON public.email_project_assignments 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and colaboradores can manage email project assignments" 
ON public.email_project_assignments 
FOR ALL 
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- Create indexes for better performance
CREATE INDEX idx_email_project_assignments_email_id ON public.email_project_assignments(email_id);
CREATE INDEX idx_email_project_assignments_project_id ON public.email_project_assignments(project_id);