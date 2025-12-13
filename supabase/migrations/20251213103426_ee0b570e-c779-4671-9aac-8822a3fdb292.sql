-- =====================================================
-- FIX 1: STORAGE_EXPOSURE - Restrict storage access based on project_documents RLS
-- =====================================================

-- Create a function to check if user can access a storage file
-- This aligns storage access with project_documents table RLS
CREATE OR REPLACE FUNCTION public.can_access_storage_file(file_path TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin always has access
  IF has_role(auth.uid(), 'administrador'::app_role) THEN
    RETURN TRUE;
  END IF;
  
  -- Colaborador has access
  IF has_role(auth.uid(), 'colaborador'::app_role) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user uploaded the document
  IF EXISTS (
    SELECT 1 FROM public.project_documents
    WHERE project_documents.file_path = can_access_storage_file.file_path
    AND uploaded_by = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user created the project containing this document
  IF EXISTS (
    SELECT 1 FROM public.project_documents pd
    JOIN public.projects p ON p.id = pd.project_id
    WHERE pd.file_path = can_access_storage_file.file_path
    AND p.created_by = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the overly permissive storage policy
DROP POLICY IF EXISTS "Authenticated users can view project documents" ON storage.objects;

-- Create new role-based storage policy
CREATE POLICY "Project-aware document access"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-documents' 
  AND public.can_access_storage_file(name)
);

-- =====================================================
-- FIX 2: PUBLIC_DATA_EXPOSURE - Restrict CRM auxiliary tables
-- =====================================================

-- Drop overly permissive policies on CRM auxiliary tables
DROP POLICY IF EXISTS "Authenticated users can view activities" ON crm_activities;
DROP POLICY IF EXISTS "Authenticated users can view professional activities" ON crm_professional_activities;
DROP POLICY IF EXISTS "Authenticated users can view contact activities" ON crm_contact_activities;
DROP POLICY IF EXISTS "Authenticated users can view contact relations" ON crm_contact_relations;

-- Create role-based policies for crm_activities
CREATE POLICY "Role-based activity access" 
ON crm_activities FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);

-- Create role-based policies for crm_professional_activities
CREATE POLICY "Role-based professional activity access" 
ON crm_professional_activities FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);

-- Create role-based policies for crm_contact_activities
CREATE POLICY "Role-based contact activity access" 
ON crm_contact_activities FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);

-- Create role-based policies for crm_contact_relations
CREATE POLICY "Role-based contact relation access" 
ON crm_contact_relations FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);