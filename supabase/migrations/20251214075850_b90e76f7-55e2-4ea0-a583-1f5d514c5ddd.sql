-- Remove insecure RLS policy that allows anonymous access to profiles
-- The policy "Require authentication for profiles access" is vulnerable because
-- anonymous users in Supabase have a valid auth.uid(), making the check insufficient.
-- The existing "Users can view their own profile" and "Admins can view all profiles" policies are sufficient.

DROP POLICY IF EXISTS "Require authentication for profiles access" ON public.profiles;