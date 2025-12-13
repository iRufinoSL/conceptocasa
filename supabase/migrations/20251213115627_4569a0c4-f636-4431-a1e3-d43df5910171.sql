-- Fix security issue 1: Remove insecure "Allow first admin creation" policy
-- This policy allows any authenticated user to become admin if no admin exists
DROP POLICY IF EXISTS "Allow first admin creation" ON public.user_roles;

-- Fix security issue 2: Replace overly permissive crm_contacts SELECT policy
-- The current policy allows ANY authenticated user to see all contact PII
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.crm_contacts;

-- Create role-restricted policy for crm_contacts
-- Only administrators and collaborators should access CRM contact data
CREATE POLICY "Role-based contact access"
ON public.crm_contacts
FOR SELECT
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR
  has_role(auth.uid(), 'colaborador'::app_role)
);