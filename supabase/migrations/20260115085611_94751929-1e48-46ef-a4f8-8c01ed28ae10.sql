-- Add notification preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS notification_type VARCHAR(20) DEFAULT 'email' CHECK (notification_type IN ('email', 'sms', 'both', 'none'));

-- Add comments
COMMENT ON COLUMN public.profiles.notification_email IS 'Email address for receiving notifications';
COMMENT ON COLUMN public.profiles.notification_phone IS 'Phone number for receiving SMS notifications';
COMMENT ON COLUMN public.profiles.notification_type IS 'Preferred notification method: email, sms, both, or none';