-- Create table to store 2FA OTP codes
CREATE TABLE public.auth_otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '5 minutes'),
  verified_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.auth_otp_codes ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX idx_auth_otp_codes_user_id ON public.auth_otp_codes(user_id);
CREATE INDEX idx_auth_otp_codes_expires ON public.auth_otp_codes(expires_at);

-- RLS policies - only authenticated users can access their own codes
CREATE POLICY "Users can view their own OTP codes"
ON public.auth_otp_codes
FOR SELECT
USING (auth.uid() = user_id);

-- Function to clean up expired OTP codes (called by cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otp_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.auth_otp_codes
  WHERE expires_at < now() OR verified_at IS NOT NULL;
END;
$$;

-- Add 2FA settings to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_phone TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN public.profiles.two_factor_phone IS 'Phone number used for 2FA SMS codes';