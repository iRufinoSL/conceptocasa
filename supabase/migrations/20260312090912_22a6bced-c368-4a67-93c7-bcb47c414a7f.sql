
-- Table for files attached to admin documents (invoices, purchase orders)
CREATE TABLE public.admin_document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL, -- 'invoice' or 'purchase_order'
  document_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  is_generated_pdf BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_admin_document_files_doc ON public.admin_document_files(document_type, document_id);

-- Enable RLS
ALTER TABLE public.admin_document_files ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin full access to admin_document_files"
ON public.admin_document_files FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Colaborador full access to admin_document_files"
ON public.admin_document_files FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'colaborador'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'colaborador'::public.app_role));

-- Storage bucket for admin document files
INSERT INTO storage.buckets (id, name, public)
VALUES ('admin-document-files', 'admin-document-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Admin storage access admin-document-files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'admin-document-files' AND (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
))
WITH CHECK (bucket_id = 'admin-document-files' AND (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
));
