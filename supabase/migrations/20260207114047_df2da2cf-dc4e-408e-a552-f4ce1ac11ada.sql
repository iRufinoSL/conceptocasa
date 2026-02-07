
-- Document templates: stores uploaded originals and their rendered page images
CREATE TABLE public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  original_file_path TEXT NOT NULL,
  original_file_type TEXT,
  page_count INTEGER NOT NULL DEFAULT 1,
  page_image_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all templates" ON public.document_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create templates" ON public.document_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own templates" ON public.document_templates
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own templates" ON public.document_templates
  FOR DELETE USING (auth.uid() = created_by);

-- Editable zones within a template page (coordinates are percentage-based 0-100)
CREATE TABLE public.document_template_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  zone_x NUMERIC NOT NULL,
  zone_y NUMERIC NOT NULL,
  zone_width NUMERIC NOT NULL,
  zone_height NUMERIC NOT NULL,
  table_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  font_family TEXT NOT NULL DEFAULT 'Arial',
  font_size NUMERIC NOT NULL DEFAULT 9,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_template_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view zones" ON public.document_template_zones
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert zones" ON public.document_template_zones
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update zones" ON public.document_template_zones
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete zones" ON public.document_template_zones
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Generated documents from templates
CREATE TABLE public.document_template_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  edited_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_file_path TEXT,
  output_format TEXT NOT NULL DEFAULT 'pdf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.document_template_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view outputs" ON public.document_template_outputs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create outputs" ON public.document_template_outputs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own outputs" ON public.document_template_outputs
  FOR DELETE USING (auth.uid() = created_by);

-- Auto-update timestamp trigger
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
