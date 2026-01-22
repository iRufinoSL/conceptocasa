-- Add columns for email tracking and reminders
ALTER TABLE public.email_messages 
ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS response_received BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN public.email_messages.response_deadline IS 'Deadline for expected response from recipient';
COMMENT ON COLUMN public.email_messages.delivery_status IS 'Status from email provider: pending, sent, delivered, opened, bounced, failed';
COMMENT ON COLUMN public.email_messages.delivery_updated_at IS 'When delivery status was last updated';
COMMENT ON COLUMN public.email_messages.response_received IS 'Whether a response has been received for this email';
COMMENT ON COLUMN public.email_messages.reminder_sent_at IS 'When the deadline reminder was sent';

-- Create index for efficient deadline queries
CREATE INDEX IF NOT EXISTS idx_email_messages_response_deadline 
ON public.email_messages(response_deadline) 
WHERE response_deadline IS NOT NULL AND response_received = false;