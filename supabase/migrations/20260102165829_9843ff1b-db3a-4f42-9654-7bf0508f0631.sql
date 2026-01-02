-- Add entry_type column to accounting_entries table
ALTER TABLE public.accounting_entries 
ADD COLUMN entry_type text DEFAULT 'compra';

-- Add supplier_id column to link entries with contacts (suppliers/clients)
ALTER TABLE public.accounting_entries 
ADD COLUMN supplier_id uuid REFERENCES public.crm_contacts(id);

-- Add vat_rate column for the VAT percentage
ALTER TABLE public.accounting_entries 
ADD COLUMN vat_rate numeric DEFAULT 21;

-- Add expense_account_id column for the expense/income account
ALTER TABLE public.accounting_entries 
ADD COLUMN expense_account_id uuid REFERENCES public.accounting_accounts(id);

-- Comment on the entry_type column
COMMENT ON COLUMN public.accounting_entries.entry_type IS 'Type of accounting entry: compra (purchase), venta (sale), cobro (collection), pago (payment)';