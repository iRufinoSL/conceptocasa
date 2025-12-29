-- Create storage bucket for accounting documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('accounting-documents', 'accounting-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for accounting documents bucket
CREATE POLICY "Admins can manage accounting documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'accounting-documents' 
  AND public.has_role(auth.uid(), 'administrador'::public.app_role)
);

CREATE POLICY "Colaboradores can view accounting documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'accounting-documents' 
  AND public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

CREATE POLICY "Colaboradores can upload accounting documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'accounting-documents' 
  AND public.has_role(auth.uid(), 'colaborador'::public.app_role)
);