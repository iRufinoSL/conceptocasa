
-- Add read receipt tracking columns to email_messages
ALTER TABLE public.email_messages 
ADD COLUMN IF NOT EXISTS request_read_receipt boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS read_receipt_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS receipt_reminder_sent boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS receipt_reminder_sent_at timestamp with time zone;

-- Create an edge function to serve tracking pixel
-- We'll track opens via the resend webhook 'email.opened' event
-- The check-email-receipts function will run periodically to send SMS reminders
