-- Remove the remaining permissive SELECT policy that exposes all attachments
DROP POLICY IF EXISTS "Users can view email attachments" ON public.email_attachments;