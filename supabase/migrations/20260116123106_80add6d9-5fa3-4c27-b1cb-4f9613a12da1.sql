-- Create bucket for large urban planning documents (PGOUs, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pgou-documents', 'pgou-documents', false, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Create table to track large document processing
CREATE TABLE IF NOT EXISTS public.urban_document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  urban_profile_id UUID REFERENCES public.urban_profiles(id) ON DELETE SET NULL,
  
  -- Source info
  source_type TEXT NOT NULL CHECK (source_type IN ('storage', 'url')),
  storage_path TEXT,
  external_url TEXT,
  original_filename TEXT,
  file_size_bytes BIGINT,
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Extracted data
  extracted_text TEXT,
  extracted_data JSONB,
  pages_processed INTEGER,
  total_pages INTEGER,
  
  -- Metadata
  document_type TEXT DEFAULT 'pgou', -- pgou, normas_subsidiarias, plan_parcial, etc.
  municipality TEXT,
  province TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.urban_document_uploads ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can do everything on urban_document_uploads"
ON public.urban_document_uploads
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Colaboradores can manage documents for budgets they have access to
CREATE POLICY "Colaboradores can view urban documents for accessible budgets"
ON public.urban_document_uploads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'colaborador'::public.app_role) AND
  public.has_presupuesto_access(auth.uid(), budget_id)
);

CREATE POLICY "Colaboradores can insert urban documents for accessible budgets"
ON public.urban_document_uploads
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'colaborador'::public.app_role) AND
  public.has_presupuesto_access(auth.uid(), budget_id)
);

-- Storage policies for pgou-documents bucket
CREATE POLICY "Authenticated users can upload pgou documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pgou-documents');

CREATE POLICY "Users can view their pgou documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pgou-documents' AND
  (
    public.has_role(auth.uid(), 'administrador'::public.app_role) OR
    public.has_role(auth.uid(), 'colaborador'::public.app_role)
  )
);

CREATE POLICY "Admins can delete pgou documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pgou-documents' AND
  public.has_role(auth.uid(), 'administrador'::public.app_role)
);

-- Index for performance
CREATE INDEX idx_urban_document_uploads_budget ON public.urban_document_uploads(budget_id);
CREATE INDEX idx_urban_document_uploads_status ON public.urban_document_uploads(status);