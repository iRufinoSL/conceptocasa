-- Remove overly permissive SELECT policies on email_templates
DROP POLICY IF EXISTS "Authenticated users can view templates" ON email_templates;

-- Remove overly permissive SELECT policies on email_campaigns
DROP POLICY IF EXISTS "Authenticated users can view campaigns" ON email_campaigns;

-- Remove overly permissive SELECT policies on email_campaign_recipients
DROP POLICY IF EXISTS "Authenticated users can view campaign recipients" ON email_campaign_recipients;

-- Add deny anonymous access policies (missing from these tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'email_templates' 
    AND policyname = 'Deny anonymous access'
  ) THEN
    CREATE POLICY "Deny anonymous access" ON email_templates
    FOR ALL USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'email_campaigns' 
    AND policyname = 'Deny anonymous access'
  ) THEN
    CREATE POLICY "Deny anonymous access" ON email_campaigns
    FOR ALL USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'email_campaign_recipients' 
    AND policyname = 'Deny anonymous access'
  ) THEN
    CREATE POLICY "Deny anonymous access" ON email_campaign_recipients
    FOR ALL USING (false);
  END IF;
END $$;