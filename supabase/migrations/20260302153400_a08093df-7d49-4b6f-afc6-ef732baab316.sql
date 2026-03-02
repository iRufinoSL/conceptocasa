
-- Fix 1: Add RESTRICTIVE policy to profiles blocking anonymous access
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- Fix 2: Strengthen website_events rate limiting with global hourly cap
CREATE OR REPLACE FUNCTION public.rate_limit_website_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  session_count integer;
  global_count integer;
BEGIN
  -- Per-session rate limit: max 100 events/hour
  SELECT COUNT(*) INTO session_count
  FROM public.website_events
  WHERE session_id = NEW.session_id
    AND created_at > now() - interval '1 hour';

  IF session_count >= 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded for session';
  END IF;

  -- Global rate limit: max 5000 events/hour to prevent abuse via session rotation
  SELECT COUNT(*) INTO global_count
  FROM public.website_events
  WHERE created_at > now() - interval '1 hour';

  IF global_count >= 5000 THEN
    RAISE EXCEPTION 'Global rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$function$;
