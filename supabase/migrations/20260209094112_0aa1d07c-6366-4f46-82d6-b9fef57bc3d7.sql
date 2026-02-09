
-- Drop the overly permissive service role policy (service role key bypasses RLS automatically)
DROP POLICY IF EXISTS "Service role full access to voice notes" ON public.voice_notes;
