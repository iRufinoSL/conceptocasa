-- Add contact_id column to accounting_accounts to link accounts with CRM contacts
ALTER TABLE public.accounting_accounts 
ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_contact_id ON public.accounting_accounts(contact_id);

-- Add is_posted column to invoices to track if invoice has been posted to accounting
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS is_posted boolean DEFAULT false;

-- Add accounting_entry_id to invoices to link to the created accounting entry
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS accounting_entry_id uuid REFERENCES public.accounting_entries(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoices_accounting_entry_id ON public.invoices(accounting_entry_id);