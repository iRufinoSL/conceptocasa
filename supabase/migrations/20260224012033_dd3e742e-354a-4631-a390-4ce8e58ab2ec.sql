
-- Drop the overly permissive service role policy on voice_notes
DROP POLICY IF EXISTS "Service role full access to voice notes" ON public.voice_notes;

-- Allow service role to read only due, unsent reminders
CREATE POLICY "Service role can read due reminders"
ON public.voice_notes FOR SELECT
TO service_role
USING (
  reminder_at IS NOT NULL AND
  reminder_at <= now() AND
  status = 'active' AND
  sms_sent = false
);

-- Allow service role to update only SMS fields for due reminders
CREATE POLICY "Service role can update SMS status"
ON public.voice_notes FOR UPDATE
TO service_role
USING (
  reminder_at IS NOT NULL AND
  reminder_at <= now() AND
  status = 'active' AND
  sms_sent = false
)
WITH CHECK (true);
