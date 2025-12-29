-- 1. Create accounting_documents table to store documents related to accounting entries
CREATE TABLE public.accounting_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES public.accounting_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.accounting_documents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage accounting documents"
ON public.accounting_documents
FOR ALL
USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view documents for their budget entries"
ON public.accounting_documents
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR EXISTS (
    SELECT 1 FROM accounting_entries ae
    WHERE ae.id = accounting_documents.entry_id
    AND has_presupuesto_access(auth.uid(), ae.budget_id)
  )
);

CREATE POLICY "Deny anonymous access"
ON public.accounting_documents
FOR ALL
USING (false);