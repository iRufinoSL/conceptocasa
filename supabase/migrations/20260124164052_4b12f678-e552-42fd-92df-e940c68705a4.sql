-- Create table for preliminary urban reports (non-binding)
CREATE TABLE public.preliminary_urban_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL DEFAULT 'Otro',
  content_text TEXT,
  file_path TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  source TEXT,
  report_date DATE,
  is_analyzed BOOLEAN DEFAULT false,
  analysis_result JSONB,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.preliminary_urban_reports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view reports for accessible budgets"
ON public.preliminary_urban_reports
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.presupuestos p
    WHERE p.id = budget_id
    AND (
      public.has_role(auth.uid(), 'administrador') OR
      public.has_presupuesto_access(auth.uid(), p.id)
    )
  )
);

CREATE POLICY "Admins can insert reports"
ON public.preliminary_urban_reports
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can update reports"
ON public.preliminary_urban_reports
FOR UPDATE
USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can delete reports"
ON public.preliminary_urban_reports
FOR DELETE
USING (public.has_role(auth.uid(), 'administrador'));

-- Create storage bucket for preliminary reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('preliminary-reports', 'preliminary-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for preliminary reports
CREATE POLICY "Authenticated users can view preliminary reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'preliminary-reports' AND auth.role() = 'authenticated');

CREATE POLICY "Admins can upload preliminary reports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'preliminary-reports' AND public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can update preliminary reports"
ON storage.objects FOR UPDATE
USING (bucket_id = 'preliminary-reports' AND public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can delete preliminary reports"
ON storage.objects FOR DELETE
USING (bucket_id = 'preliminary-reports' AND public.has_role(auth.uid(), 'administrador'));

-- Add trigger for updated_at
CREATE TRIGGER update_preliminary_urban_reports_updated_at
BEFORE UPDATE ON public.preliminary_urban_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();