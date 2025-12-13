-- Fix CRM contacts access: Colaboradores can only see contacts they created
-- Drop existing policy
DROP POLICY IF EXISTS "Role-based contact access" ON public.crm_contacts;

-- Create new restrictive policy
-- Administrators: full access to all contacts
-- Colaboradores: only contacts they created
CREATE POLICY "Role-based contact access"
ON public.crm_contacts
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  (has_role(auth.uid(), 'colaborador'::app_role) AND created_by = auth.uid())
);