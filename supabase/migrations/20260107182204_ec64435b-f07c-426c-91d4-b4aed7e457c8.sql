-- Fix overly permissive notification creation policy
-- Drop the current permissive policy that allows any authenticated user to create notifications for any user
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Create a function to check if a user can create notifications
CREATE OR REPLACE FUNCTION public.can_create_notification(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Users can only create notifications for themselves
  IF auth.uid() = target_user_id THEN
    RETURN TRUE;
  END IF;
  
  -- Admins can create notifications for anyone
  IF public.has_role(auth.uid(), 'administrador'::public.app_role) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a controlled notification creation policy for authenticated users
CREATE POLICY "Controlled notification creation"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (public.can_create_notification(user_id));

-- Allow service role to create any notification (for edge functions/triggers)
CREATE POLICY "Service role can create notifications"
ON public.notifications FOR INSERT
TO service_role
WITH CHECK (true);