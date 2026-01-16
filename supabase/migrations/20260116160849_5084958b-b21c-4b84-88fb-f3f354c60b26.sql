-- Fix email_attachments table RLS policy to restrict access to staff roles only
-- This aligns the table policy with the storage bucket policy

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view email attachments" ON public.email_attachments;
DROP POLICY IF EXISTS "Authenticated staff can view email attachments" ON public.email_attachments;

-- Create a properly restricted SELECT policy for staff only
CREATE POLICY "Staff can view email attachments"
ON public.email_attachments FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);