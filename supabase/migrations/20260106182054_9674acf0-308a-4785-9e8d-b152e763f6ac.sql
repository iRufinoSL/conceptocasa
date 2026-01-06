-- Drop the overly permissive INSERT policy on notifications
-- This policy allows any authenticated user to create notifications for any other user
-- Notifications should only be created by edge functions using service role (which bypasses RLS)
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;