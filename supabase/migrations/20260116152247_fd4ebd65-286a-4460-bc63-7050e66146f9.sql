-- Fix 1: Replace overly permissive email attachments storage policy with role-based access
DROP POLICY IF EXISTS "Authenticated users can read email attachments" ON storage.objects;

CREATE POLICY "Staff can read email attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-attachments' 
  AND (public.has_role(auth.uid(), 'administrador'::public.app_role) 
       OR public.has_role(auth.uid(), 'colaborador'::public.app_role))
);