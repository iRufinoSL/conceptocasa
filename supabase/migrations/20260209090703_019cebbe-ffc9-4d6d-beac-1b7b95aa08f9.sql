
-- 1. Create document_types management table for CRUD of available types
CREATE TABLE public.document_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read document types" 
  ON public.document_types FOR SELECT USING (true);

CREATE POLICY "Admins can insert document types" 
  ON public.document_types FOR INSERT 
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Admins can update document types" 
  ON public.document_types FOR UPDATE 
  USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Admins can delete document types" 
  ON public.document_types FOR DELETE 
  USING (has_role(auth.uid(), 'administrador'::app_role));

-- Seed with default + existing custom types
INSERT INTO public.document_types (name) VALUES 
  ('Adjunto'), ('Certificado'), ('Competencia'), ('Contrato'), ('Email'),
  ('Enlace web'), ('Factura'), ('Fotografía'), ('Informe'), ('Licencia'), 
  ('Memoria'), ('Notas'), ('Otro'), ('Plano'), ('Presupuesto')
ON CONFLICT (name) DO NOTHING;

-- 2. Normalize case duplicates in existing documents
UPDATE project_documents SET document_type = 'Informe' 
  WHERE lower(document_type) = 'informe' AND document_type != 'Informe';
UPDATE project_documents SET document_type = 'Otro' 
  WHERE lower(document_type) = 'otro' AND document_type != 'Otro';

-- 3. Add document_types array column for multi-type support
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS document_types text[] DEFAULT '{}';

-- Migrate existing single type to array
UPDATE project_documents 
SET document_types = ARRAY[document_type]
WHERE document_type IS NOT NULL 
  AND document_type != ''
  AND (document_types IS NULL OR document_types = '{}');

-- 4. Create budget_document_links junction table (many-to-many)
CREATE TABLE public.budget_document_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(budget_id, document_id)
);

ALTER TABLE public.budget_document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read budget document links" 
  ON public.budget_document_links FOR SELECT 
  USING (has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users can insert budget document links" 
  ON public.budget_document_links FOR INSERT 
  WITH CHECK (has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users can delete budget document links" 
  ON public.budget_document_links FOR DELETE 
  USING (has_presupuesto_access(auth.uid(), budget_id));

-- 5. Migrate existing data: link project documents to their budgets
INSERT INTO public.budget_document_links (budget_id, document_id)
SELECT p.id, pd.id
FROM presupuestos p
JOIN project_documents pd ON pd.project_id = p.project_id
WHERE pd.project_id IS NOT NULL
ON CONFLICT (budget_id, document_id) DO NOTHING;

INSERT INTO public.budget_document_links (budget_id, document_id)
SELECT pd.budget_id, pd.id
FROM project_documents pd
WHERE pd.budget_id IS NOT NULL
ON CONFLICT (budget_id, document_id) DO NOTHING;

-- 6. Indexes for performance
CREATE INDEX idx_budget_document_links_budget ON public.budget_document_links(budget_id);
CREATE INDEX idx_budget_document_links_document ON public.budget_document_links(document_id);
CREATE INDEX idx_project_documents_types ON public.project_documents USING GIN(document_types);
