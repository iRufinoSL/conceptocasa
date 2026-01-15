-- Fix RLS policy for user_roles INSERT - needs both USING and WITH CHECK
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));

-- Also fix UPDATE policy to have WITH CHECK
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));

-- Add dual notification preferences to profiles
-- Personal/Direct notifications (immediate alerts)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_notification_email VARCHAR(255);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_notification_phone VARCHAR(50);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_notification_type VARCHAR(20) DEFAULT 'email' 
  CHECK (personal_notification_type IN ('email', 'sms', 'whatsapp', 'all', 'none'));

-- System/Professional notifications (budget, activities, general communications)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS system_notification_email VARCHAR(255);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS system_notification_phone VARCHAR(50);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS system_notification_type VARCHAR(20) DEFAULT 'email'
  CHECK (system_notification_type IN ('email', 'sms', 'whatsapp', 'all', 'none'));

-- Migrate existing notification data to personal notifications
UPDATE public.profiles 
SET personal_notification_email = notification_email,
    personal_notification_phone = notification_phone,
    personal_notification_type = COALESCE(notification_type, 'email'),
    system_notification_email = notification_email,
    system_notification_phone = notification_phone,
    system_notification_type = COALESCE(notification_type, 'email')
WHERE notification_email IS NOT NULL OR notification_phone IS NOT NULL;