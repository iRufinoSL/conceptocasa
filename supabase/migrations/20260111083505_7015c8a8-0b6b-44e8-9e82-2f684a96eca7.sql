-- Añadir campos de tarea a la tabla budget_activity_resources
-- Las tareas son un tipo de recurso con resource_type = 'Tarea'

ALTER TABLE public.budget_activity_resources
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS task_status text DEFAULT 'pendiente' CHECK (task_status IN ('pendiente', 'realizada'));

-- Comentarios para documentar los campos
COMMENT ON COLUMN public.budget_activity_resources.start_date IS 'Fecha de inicio para recursos tipo Tarea';
COMMENT ON COLUMN public.budget_activity_resources.duration_days IS 'Duración en días para recursos tipo Tarea';
COMMENT ON COLUMN public.budget_activity_resources.task_status IS 'Estado de la tarea: pendiente o realizada';

-- Crear tabla para imágenes de recursos tipo Tarea
CREATE TABLE IF NOT EXISTS public.budget_resource_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id uuid NOT NULL REFERENCES public.budget_activity_resources(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  file_type text,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Crear tabla para contactos de recursos tipo Tarea
CREATE TABLE IF NOT EXISTS public.budget_resource_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id uuid NOT NULL REFERENCES public.budget_activity_resources(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(resource_id, contact_id)
);

-- Habilitar RLS
ALTER TABLE public.budget_resource_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_resource_contacts ENABLE ROW LEVEL SECURITY;

-- Políticas para budget_resource_images
CREATE POLICY "Users with admin or colaborador role can view resource images"
ON public.budget_resource_images
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador role can insert resource images"
ON public.budget_resource_images
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador role can update resource images"
ON public.budget_resource_images
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador role can delete resource images"
ON public.budget_resource_images
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

-- Políticas para budget_resource_contacts
CREATE POLICY "Users with admin or colaborador role can view resource contacts"
ON public.budget_resource_contacts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador role can insert resource contacts"
ON public.budget_resource_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador role can update resource contacts"
ON public.budget_resource_contacts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador role can delete resource contacts"
ON public.budget_resource_contacts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

-- Crear bucket para imágenes de recursos/tareas si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('resource-images', 'resource-images', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para resource-images
CREATE POLICY "Authenticated users can view resource images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resource-images');

CREATE POLICY "Users with admin or colaborador can upload resource images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resource-images' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);

CREATE POLICY "Users with admin or colaborador can delete resource images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'resource-images' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('administrador', 'colaborador')
  )
);