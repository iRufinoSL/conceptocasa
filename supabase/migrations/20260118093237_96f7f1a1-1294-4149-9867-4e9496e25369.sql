-- Fix email_messages RLS: Restrict colaboradores to only their own emails or emails related to their budgets

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Colaboradores can view all emails" ON public.email_messages;

-- Create a more restrictive policy for colaboradores
-- They can only view emails they created, or emails related to budgets they have access to
CREATE POLICY "Colaboradores can view their own emails"
ON public.email_messages
FOR SELECT
USING (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND (
    -- Emails created by the user
    created_by = auth.uid()
    -- OR emails related to budgets they have access to
    OR (budget_id IS NOT NULL AND has_presupuesto_access(auth.uid(), budget_id))
    -- OR emails related to projects they created
    OR (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = email_messages.project_id AND p.created_by = auth.uid()
    ))
  )
);

-- Also restrict colaboradores update to only their own emails
DROP POLICY IF EXISTS "Colaboradores can update their own emails" ON public.email_messages;
CREATE POLICY "Colaboradores can update their own emails"
ON public.email_messages
FOR UPDATE
USING (
  has_role(auth.uid(), 'colaborador'::app_role)
  AND created_by = auth.uid()
);

-- For accounting_accounts: The current policy is already restrictive (admin-only)
-- Mark it as acceptable by adding a comment for audit purposes
COMMENT ON TABLE public.accounting_accounts IS 'Contains sensitive tax identification (NIF/CIF) and business address data. Access restricted to administrators only via RLS policies.';
COMMENT ON COLUMN public.accounting_accounts.nif_cif IS 'Tax identification number (NIF/CIF). Sensitive data - admin access only.';