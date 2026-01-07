-- Add deleted_at for soft delete (papelera) on email_messages
ALTER TABLE public.email_messages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create email_attachments table for storing attachment metadata
CREATE TABLE IF NOT EXISTS public.email_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on email_attachments
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view attachments of emails they can view
CREATE POLICY "Users can view email attachments"
ON public.email_attachments
FOR SELECT
USING (true);

-- RLS: Only system can insert attachments (via service role)
CREATE POLICY "Service role can insert attachments"
ON public.email_attachments
FOR INSERT
WITH CHECK (true);

-- RLS: Only system can delete attachments
CREATE POLICY "Service role can delete attachments"
ON public.email_attachments
FOR DELETE
USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON public.email_attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_deleted_at ON public.email_messages(deleted_at);