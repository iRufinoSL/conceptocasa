-- Drop existing overly permissive policies on email_attachments
DROP POLICY IF EXISTS "Anyone can view email attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Service role can insert email attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Service role can delete email attachments" ON public.email_attachments;

-- Create secure RLS policies for email_attachments
-- Only authenticated staff (admin or colaborador) can view attachments
CREATE POLICY "Authenticated staff can view email attachments"
ON public.email_attachments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) 
  OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- Only authenticated staff can insert attachments (for manual uploads)
CREATE POLICY "Authenticated staff can insert email attachments"
ON public.email_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) 
  OR public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- Only admins can delete attachments
CREATE POLICY "Admins can delete email attachments"
ON public.email_attachments
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
);