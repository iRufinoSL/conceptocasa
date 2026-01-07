-- Add new fields to email_messages for improved functionality
-- 1. is_read: to track if email has been read
-- 2. read_at: timestamp when email was read
-- 3. budget_id: for folder/archive organization (linked to budgets)
-- 4. snoozed_until: to postpone emails to a specific date/time

ALTER TABLE public.email_messages 
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS read_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES public.presupuestos(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS snoozed_until timestamp with time zone;

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_email_messages_is_read ON public.email_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_email_messages_budget_id ON public.email_messages(budget_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_snoozed_until ON public.email_messages(snoozed_until);
CREATE INDEX IF NOT EXISTS idx_email_messages_external_id ON public.email_messages(external_id);