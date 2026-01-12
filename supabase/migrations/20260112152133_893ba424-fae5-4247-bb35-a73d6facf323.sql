-- Fix PUBLIC_DATA_EXPOSURE: Restrict accounting_accounts to admin-only access
-- Drop the overly permissive policies that allow colaboradores and all authenticated users to view sensitive tax data

DROP POLICY IF EXISTS "Admins and colaboradores can view accounts" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Authenticated users can view accounting accounts" ON public.accounting_accounts;

-- Create admin-only SELECT policy for accounting_accounts (contains sensitive NIF/CIF data)
CREATE POLICY "Admins can view accounting accounts"
  ON public.accounting_accounts
  FOR SELECT
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role));