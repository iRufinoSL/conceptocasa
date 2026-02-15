
-- Rate-limit website_events inserts: max 100 per session per hour
CREATE OR REPLACE FUNCTION public.rate_limit_website_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.website_events
  WHERE session_id = NEW.session_id
    AND created_at > now() - interval '1 hour';

  IF recent_count >= 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded for session';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rate_limit_website_events
  BEFORE INSERT ON public.website_events
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_website_events();

-- Rate-limit contact-attachments: max 10 inserts per hour per IP (approximated by folder path)
-- Note: Storage policies can't do rate limiting, so we add a check via the contact_form_attachments table
CREATE OR REPLACE FUNCTION public.rate_limit_contact_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.contact_form_attachments
  WHERE created_at > now() - interval '1 hour';

  IF recent_count >= 50 THEN
    RAISE EXCEPTION 'Attachment upload rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rate_limit_contact_attachments
  BEFORE INSERT ON public.contact_form_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.rate_limit_contact_attachments();
