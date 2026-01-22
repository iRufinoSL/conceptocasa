-- Ensure the Users can view their own roles policy exists and works correctly
-- First drop and recreate the policy to ensure it's correct
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);