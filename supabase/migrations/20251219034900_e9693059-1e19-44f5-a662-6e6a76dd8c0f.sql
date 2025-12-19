-- Create a safe server-side check for whether an admin already exists (used by /setup)
-- This avoids client-side direct reads of user_roles from unauthenticated context.
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'administrador'::public.app_role
    LIMIT 1
  );
$$;

-- Allow both anonymous and authenticated callers to execute this function.
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;