-- Fix overly permissive RLS policy on email_budget_assignments
-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Users can view email budget assignments" ON public.email_budget_assignments;

-- Create a properly restricted SELECT policy requiring authentication and proper roles
CREATE POLICY "Authenticated staff can view email budget assignments" 
ON public.email_budget_assignments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);

-- Also fix email_project_assignments which has the same issue
DROP POLICY IF EXISTS "Users can view email project assignments" ON public.email_project_assignments;

CREATE POLICY "Authenticated staff can view email project assignments" 
ON public.email_project_assignments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'colaborador'::app_role)
);