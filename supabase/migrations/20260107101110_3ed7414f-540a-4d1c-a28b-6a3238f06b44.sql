-- Tighten profiles read access to prevent cross-user email harvesting

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove existing broad/ambiguous policy if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Restricted profile access'
  ) THEN
    EXECUTE 'DROP POLICY "Restricted profile access" ON public.profiles';
  END IF;
END
$$;

-- Create explicit, least-privilege SELECT policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can view own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can view all profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), ''administrador''::public.app_role))';
  END IF;
END
$$;