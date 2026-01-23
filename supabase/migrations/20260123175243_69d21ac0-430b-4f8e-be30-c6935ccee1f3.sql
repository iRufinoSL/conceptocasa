ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS sms_sender_phone text;