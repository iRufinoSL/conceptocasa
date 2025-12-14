-- Add defense-in-depth policy to block unauthenticated/anonymous access to profiles
-- This explicitly denies access when auth.uid() IS NULL

CREATE POLICY "Require authentication for profiles access"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);