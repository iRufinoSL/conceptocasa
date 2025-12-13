-- =====================================================
-- FIX: PUBLIC_DATA_EXPOSURE - Restrict table access based on roles
-- =====================================================

-- 1. CRM Opportunities - restrict to admins, colaboradores, or creator
DROP POLICY IF EXISTS "Authenticated users can view opportunities" ON crm_opportunities;

CREATE POLICY "Role-based opportunity access" 
ON crm_opportunities FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  created_by = auth.uid()
);

-- 2. CRM Managements - restrict to admins, colaboradores, or creator
DROP POLICY IF EXISTS "Authenticated users can view managements" ON crm_managements;

CREATE POLICY "Role-based management access" 
ON crm_managements FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  created_by = auth.uid()
);

-- 3. CRM Management Contacts - restrict based on management access
DROP POLICY IF EXISTS "Authenticated users can view management contacts" ON crm_management_contacts;

CREATE POLICY "Role-based management contacts access" 
ON crm_management_contacts FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  EXISTS (
    SELECT 1 FROM crm_managements m 
    WHERE m.id = management_id 
    AND m.created_by = auth.uid()
  )
);

-- 4. Projects - restrict to admins, colaboradores, or users with linked contacts
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;

CREATE POLICY "Role-based project access" 
ON projects FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  created_by = auth.uid()
);

-- 5. Project Contacts - restrict based on project access
DROP POLICY IF EXISTS "Authenticated users can view project contacts" ON project_contacts;

CREATE POLICY "Role-based project contacts access" 
ON project_contacts FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  EXISTS (
    SELECT 1 FROM projects p 
    WHERE p.id = project_id 
    AND p.created_by = auth.uid()
  )
);

-- 6. Project Predesigns - restrict based on project access
DROP POLICY IF EXISTS "Authenticated users can view project predesigns" ON project_predesigns;

CREATE POLICY "Role-based project predesigns access" 
ON project_predesigns FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  EXISTS (
    SELECT 1 FROM projects p 
    WHERE p.id = project_id 
    AND p.created_by = auth.uid()
  )
);

-- 7. Project Documents - restrict based on project access
DROP POLICY IF EXISTS "Authenticated users can view project documents" ON project_documents;

CREATE POLICY "Role-based project documents access" 
ON project_documents FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role) OR
  uploaded_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM projects p 
    WHERE p.id = project_id 
    AND p.created_by = auth.uid()
  )
);