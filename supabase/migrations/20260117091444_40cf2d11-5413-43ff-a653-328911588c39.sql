-- Fix email_attachments RLS policies - drop ALL existing policies first
DROP POLICY IF EXISTS "Users can view email attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Staff can view email attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Service role can insert attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Admins can delete attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Service role can delete attachments" ON public.email_attachments;

-- Create properly restrictive policies
-- Staff (administrador and colaborador) can view email attachments
CREATE POLICY "email_attachments_select_staff"
ON public.email_attachments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role) OR 
  public.has_role(auth.uid(), 'colaborador'::app_role)
);

-- Service role can insert attachments (for edge functions)
CREATE POLICY "email_attachments_insert_service"
ON public.email_attachments
FOR INSERT
TO service_role
WITH CHECK (true);

-- Admins can delete attachments
CREATE POLICY "email_attachments_delete_admin"
ON public.email_attachments
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- Service role can delete attachments (for edge functions)
CREATE POLICY "email_attachments_delete_service"
ON public.email_attachments
FOR DELETE
TO service_role
USING (true);