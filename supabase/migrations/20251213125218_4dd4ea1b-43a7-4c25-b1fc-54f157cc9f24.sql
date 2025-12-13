-- Create budget_activities table for managing activities within budgets
CREATE TABLE public.budget_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  measurement_unit TEXT DEFAULT 'ud',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.budget_activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage budget activities"
ON public.budget_activities
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view budget activities for their presupuestos"
ON public.budget_activities
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_presupuesto_access(auth.uid(), budget_id)
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_budget_activities_updated_at
BEFORE UPDATE ON public.budget_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_budget_activities_budget_id ON public.budget_activities(budget_id);
CREATE INDEX idx_budget_activities_code ON public.budget_activities(code);

-- Create storage bucket for activity files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('activity-files', 'activity-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for activity files
CREATE POLICY "Admins can manage activity files"
ON storage.objects
FOR ALL
USING (bucket_id = 'activity-files' AND has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view activity files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'activity-files' AND (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'colaborador'::app_role)
));

-- Create table for activity files
CREATE TABLE public.budget_activity_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.budget_activities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on activity files
ALTER TABLE public.budget_activity_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for activity files
CREATE POLICY "Admins can manage activity files records"
ON public.budget_activity_files
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view activity files for their presupuestos"
ON public.budget_activity_files
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.budget_activities ba
    WHERE ba.id = budget_activity_files.activity_id
    AND has_presupuesto_access(auth.uid(), ba.budget_id)
  )
);

CREATE INDEX idx_budget_activity_files_activity_id ON public.budget_activity_files(activity_id);