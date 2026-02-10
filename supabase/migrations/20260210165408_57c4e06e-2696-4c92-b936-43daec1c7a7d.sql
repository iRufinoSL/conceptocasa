
-- Block all INSERT operations from regular authenticated users
-- Only edge functions with service role can insert
CREATE POLICY "Prevent direct OTP code insertion"
ON public.auth_otp_codes FOR INSERT
TO authenticated
WITH CHECK (false);

-- Block all UPDATE operations from regular authenticated users
CREATE POLICY "Prevent OTP code modification"
ON public.auth_otp_codes FOR UPDATE
TO authenticated
USING (false);

-- Block all DELETE operations from regular authenticated users
CREATE POLICY "Prevent OTP code deletion"
ON public.auth_otp_codes FOR DELETE
TO authenticated
USING (false);
