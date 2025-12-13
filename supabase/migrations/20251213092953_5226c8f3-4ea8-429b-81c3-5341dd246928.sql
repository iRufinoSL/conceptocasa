-- Create storage bucket for project documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for project-documents bucket
-- Authenticated users can view documents
CREATE POLICY "Authenticated users can view project documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents');

-- Admins can upload documents
CREATE POLICY "Admins can upload project documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-documents' 
  AND public.has_role(auth.uid(), 'administrador'::public.app_role)
);

-- Admins can update documents
CREATE POLICY "Admins can update project documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-documents' 
  AND public.has_role(auth.uid(), 'administrador'::public.app_role)
);

-- Admins can delete documents
CREATE POLICY "Admins can delete project documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-documents' 
  AND public.has_role(auth.uid(), 'administrador'::public.app_role)
);