-- Fix profiles table SELECT policies by combining them into a single policy
-- Drop the existing separate SELECT policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a single combined SELECT policy that allows admin OR self-access
CREATE POLICY "Restricted profile access"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id OR 
  has_role(auth.uid(), 'administrador'::app_role)
);