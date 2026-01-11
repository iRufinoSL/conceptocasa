-- Create budget_tasks table
CREATE TABLE public.budget_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  duration_days INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'realizada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create budget_task_images table for multiple images per task
CREATE TABLE public.budget_task_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.budget_tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create budget_task_contacts junction table
CREATE TABLE public.budget_task_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.budget_tasks(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_id, contact_id)
);

-- Enable RLS
ALTER TABLE public.budget_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_task_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_task_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for budget_tasks
CREATE POLICY "Admins can manage all tasks"
ON public.budget_tasks
FOR ALL
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can manage all tasks"
ON public.budget_tasks
FOR ALL
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

CREATE POLICY "Users can view tasks for their budgets"
ON public.budget_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.budget_activities ba
    WHERE ba.id = budget_tasks.activity_id
    AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
  )
);

-- RLS policies for budget_task_images
CREATE POLICY "Admins can manage all task images"
ON public.budget_task_images
FOR ALL
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can manage all task images"
ON public.budget_task_images
FOR ALL
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

CREATE POLICY "Users can view task images for their budgets"
ON public.budget_task_images
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.budget_tasks bt
    JOIN public.budget_activities ba ON ba.id = bt.activity_id
    WHERE bt.id = budget_task_images.task_id
    AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
  )
);

-- RLS policies for budget_task_contacts
CREATE POLICY "Admins can manage all task contacts"
ON public.budget_task_contacts
FOR ALL
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can manage all task contacts"
ON public.budget_task_contacts
FOR ALL
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

CREATE POLICY "Users can view task contacts for their budgets"
ON public.budget_task_contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.budget_tasks bt
    JOIN public.budget_activities ba ON ba.id = bt.activity_id
    WHERE bt.id = budget_task_contacts.task_id
    AND public.has_presupuesto_access(auth.uid(), ba.budget_id)
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_budget_tasks_updated_at
BEFORE UPDATE ON public.budget_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for task images
INSERT INTO storage.buckets (id, name, public) VALUES ('task-images', 'task-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for task-images bucket
CREATE POLICY "Admins can manage task images storage"
ON storage.objects
FOR ALL
USING (bucket_id = 'task-images' AND public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaboradores can manage task images storage"
ON storage.objects
FOR ALL
USING (bucket_id = 'task-images' AND public.has_role(auth.uid(), 'colaborador'::public.app_role));