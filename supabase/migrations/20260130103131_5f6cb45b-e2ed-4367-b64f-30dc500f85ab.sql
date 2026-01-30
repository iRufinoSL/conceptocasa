-- Add fields to mark emails as documents
ALTER TABLE public.email_messages 
ADD COLUMN IF NOT EXISTS is_document boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS document_type text;

-- Create index for filtering emails that are documents
CREATE INDEX IF NOT EXISTS idx_email_messages_is_document 
ON public.email_messages(is_document) 
WHERE is_document = true;

-- Add comment for clarity
COMMENT ON COLUMN public.email_messages.is_document IS 'When true, this email appears in the Documents module';
COMMENT ON COLUMN public.email_messages.document_type IS 'Document classification type (Contrato, Factura, etc.)';