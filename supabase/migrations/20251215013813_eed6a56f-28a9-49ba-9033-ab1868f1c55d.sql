-- Create a table for budget pre-design elements (Ante-proyecto)
CREATE TABLE public.budget_predesigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL DEFAULT 'Otro',
  file_path TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.budget_predesigns ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can manage budget predesigns"
ON public.budget_predesigns
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Create policies for users with presupuesto access
CREATE POLICY "Users can view budget predesigns for their presupuestos"
ON public.budget_predesigns
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_presupuesto_access(auth.uid(), budget_id)
);

-- Create storage bucket for budget predesign files
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('budget-predesigns', 'budget-predesigns', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for budget predesign files
CREATE POLICY "Users can view budget predesign files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'budget-predesigns');

CREATE POLICY "Admins can upload budget predesign files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'budget-predesigns' AND
  has_role(auth.uid(), 'administrador'::app_role)
);

CREATE POLICY "Admins can update budget predesign files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'budget-predesigns' AND
  has_role(auth.uid(), 'administrador'::app_role)
);

CREATE POLICY "Admins can delete budget predesign files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'budget-predesigns' AND
  has_role(auth.uid(), 'administrador'::app_role)
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_budget_predesigns_updated_at
BEFORE UPDATE ON public.budget_predesigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();