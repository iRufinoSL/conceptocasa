-- Remove overly permissive SELECT policies on accounting_accounts
DROP POLICY IF EXISTS "Authenticated users can view accounts" ON accounting_accounts;
DROP POLICY IF EXISTS "All authenticated users can view accounts" ON accounting_accounts;

-- Create policy to allow only administrators and colaboradores to view accounts
CREATE POLICY "Admins and colaboradores can view accounts" ON accounting_accounts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador') OR 
  public.has_role(auth.uid(), 'colaborador')
);