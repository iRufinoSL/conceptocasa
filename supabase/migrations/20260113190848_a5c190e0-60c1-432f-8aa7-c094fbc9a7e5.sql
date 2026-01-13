-- Add secondary_phones column to crm_contacts for multiple phone numbers
ALTER TABLE public.crm_contacts 
ADD COLUMN secondary_phones TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.crm_contacts.secondary_phones IS 'Array of additional phone numbers for the contact';