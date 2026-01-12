-- Create storage bucket for contact form attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-attachments', 
  'contact-attachments', 
  false,
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
);

-- Create table to track contact form attachments
CREATE TABLE public.contact_form_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_form_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contact_form_attachments
-- Admins can do everything
CREATE POLICY "Admins can manage contact attachments"
ON public.contact_form_attachments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Colaboradores can view
CREATE POLICY "Colaboradores can view contact attachments"
ON public.contact_form_attachments
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role));

-- Storage policies for contact-attachments bucket
-- Allow public uploads (for anonymous users submitting forms)
CREATE POLICY "Anyone can upload contact attachments"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'contact-attachments');

-- Only authenticated users can view
CREATE POLICY "Authenticated users can view contact attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'contact-attachments');

-- Only admins can delete
CREATE POLICY "Admins can delete contact attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contact-attachments' 
  AND public.has_role(auth.uid(), 'administrador'::public.app_role)
);