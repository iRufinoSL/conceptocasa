-- Allow creating the first administrator when none exists
CREATE POLICY "Allow first admin creation"
ON public.user_roles
FOR INSERT
WITH CHECK (
  role = 'administrador'::app_role
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'administrador'::app_role
  )
);