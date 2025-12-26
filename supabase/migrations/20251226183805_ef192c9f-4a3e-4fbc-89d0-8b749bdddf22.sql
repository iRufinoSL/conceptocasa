-- Create external_resources table
CREATE TABLE public.external_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit_cost NUMERIC DEFAULT 0,
  unit_measure TEXT DEFAULT 'ud',
  resource_type TEXT DEFAULT 'Producto',
  image_url TEXT,
  website TEXT,
  registration_date DATE DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for related resources (composite resources)
CREATE TABLE public.external_resource_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID NOT NULL REFERENCES public.external_resources(id) ON DELETE CASCADE,
  related_resource_id UUID NOT NULL REFERENCES public.external_resources(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_relation UNIQUE(resource_id, related_resource_id)
);

-- Create table for resource attachments (files)
CREATE TABLE public.external_resource_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID NOT NULL REFERENCES public.external_resources(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_resource_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_resource_files ENABLE ROW LEVEL SECURITY;

-- Create policies for external_resources (admin-only full access, others read-only)
CREATE POLICY "Admins can manage external resources" 
ON public.external_resources 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'administrador'
  )
);

CREATE POLICY "Authenticated users can view external resources" 
ON public.external_resources 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create policies for external_resource_relations
CREATE POLICY "Admins can manage resource relations" 
ON public.external_resource_relations 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'administrador'
  )
);

CREATE POLICY "Authenticated users can view resource relations" 
ON public.external_resource_relations 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create policies for external_resource_files
CREATE POLICY "Admins can manage resource files" 
ON public.external_resource_files 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'administrador'
  )
);

CREATE POLICY "Authenticated users can view resource files" 
ON public.external_resource_files 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create storage bucket for resource files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('resource-files', 'resource-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for resource-files bucket
CREATE POLICY "Anyone can view resource files"
ON storage.objects FOR SELECT
USING (bucket_id = 'resource-files');

CREATE POLICY "Admins can upload resource files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resource-files' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'administrador'
  )
);

CREATE POLICY "Admins can delete resource files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'resource-files' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'administrador'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_external_resources_updated_at
BEFORE UPDATE ON public.external_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();