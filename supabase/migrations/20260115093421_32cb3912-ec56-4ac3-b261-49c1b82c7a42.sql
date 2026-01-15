-- Add secondary_emails column to crm_contacts for multiple email addresses
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS secondary_emails TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.crm_contacts.secondary_emails IS 'Array of additional email addresses for the contact';