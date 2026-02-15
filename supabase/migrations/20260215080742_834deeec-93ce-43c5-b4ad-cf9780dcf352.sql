-- Restrict SELECT on auth_otp_codes: no user should read OTP codes directly
-- Only the edge function via service_role needs access
DROP POLICY IF EXISTS "Users can view their own OTP codes" ON public.auth_otp_codes;

CREATE POLICY "No direct OTP code access"
  ON public.auth_otp_codes
  FOR SELECT
  USING (false);