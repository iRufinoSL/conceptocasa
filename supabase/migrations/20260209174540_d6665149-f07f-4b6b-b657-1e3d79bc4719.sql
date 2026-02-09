
-- Add validation trigger for website_events to prevent tracking injection
CREATE OR REPLACE FUNCTION public.validate_website_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed_events text[] := ARRAY['page_view', 'form_start', 'form_submit', 'button_click', 'scroll'];
BEGIN
  -- Validate event_type is from allowed list
  IF NEW.event_type IS NULL OR NOT (NEW.event_type = ANY(allowed_events)) THEN
    RAISE EXCEPTION 'Invalid event_type: %', COALESCE(LEFT(NEW.event_type, 30), 'NULL');
  END IF;

  -- Truncate and sanitize text fields to prevent abuse
  NEW.page_path := LEFT(COALESCE(NEW.page_path, '/'), 500);
  NEW.page_title := LEFT(COALESCE(NEW.page_title, ''), 200);
  NEW.referrer := LEFT(NEW.referrer, 1000);
  NEW.session_id := LEFT(COALESCE(NEW.session_id, ''), 100);
  NEW.user_agent := LEFT(NEW.user_agent, 500);

  -- Truncate UTM params
  NEW.utm_source := LEFT(NEW.utm_source, 100);
  NEW.utm_medium := LEFT(NEW.utm_medium, 100);
  NEW.utm_campaign := LEFT(NEW.utm_campaign, 200);
  NEW.utm_term := LEFT(NEW.utm_term, 200);
  NEW.utm_content := LEFT(NEW.utm_content, 200);

  -- Validate screen dimensions are reasonable
  IF NEW.screen_width IS NOT NULL AND (NEW.screen_width < 0 OR NEW.screen_width > 10000) THEN
    NEW.screen_width := NULL;
  END IF;
  IF NEW.screen_height IS NOT NULL AND (NEW.screen_height < 0 OR NEW.screen_height > 10000) THEN
    NEW.screen_height := NULL;
  END IF;

  -- Prevent setting contact_id from anonymous inserts (must be NULL unless authenticated)
  IF auth.uid() IS NULL THEN
    NEW.contact_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_website_event_trigger
BEFORE INSERT ON public.website_events
FOR EACH ROW
EXECUTE FUNCTION public.validate_website_event();
