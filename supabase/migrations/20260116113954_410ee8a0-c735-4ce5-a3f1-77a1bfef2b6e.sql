-- Create WhatsApp budget assignments table (similar to email_budget_assignments)
CREATE TABLE IF NOT EXISTS public.whatsapp_budget_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, budget_id)
);

-- Create WhatsApp project assignments table
CREATE TABLE IF NOT EXISTS public.whatsapp_project_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, project_id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_budget_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_project_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies for whatsapp_budget_assignments
CREATE POLICY "Allow authenticated users to view whatsapp budget assignments" 
ON public.whatsapp_budget_assignments 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert whatsapp budget assignments" 
ON public.whatsapp_budget_assignments 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete whatsapp budget assignments" 
ON public.whatsapp_budget_assignments 
FOR DELETE 
TO authenticated
USING (true);

-- Create policies for whatsapp_project_assignments
CREATE POLICY "Allow authenticated users to view whatsapp project assignments" 
ON public.whatsapp_project_assignments 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert whatsapp project assignments" 
ON public.whatsapp_project_assignments 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete whatsapp project assignments" 
ON public.whatsapp_project_assignments 
FOR DELETE 
TO authenticated
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_whatsapp_budget_assignments_message ON public.whatsapp_budget_assignments(message_id);
CREATE INDEX idx_whatsapp_budget_assignments_budget ON public.whatsapp_budget_assignments(budget_id);
CREATE INDEX idx_whatsapp_project_assignments_message ON public.whatsapp_project_assignments(message_id);
CREATE INDEX idx_whatsapp_project_assignments_project ON public.whatsapp_project_assignments(project_id);