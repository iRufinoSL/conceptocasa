-- Add INSERT policy to prevent direct profile inserts (profiles are created via trigger)
CREATE POLICY "Prevent direct profile inserts"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (false);

-- Add DELETE policy - only admins can delete profiles
CREATE POLICY "Only admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role));