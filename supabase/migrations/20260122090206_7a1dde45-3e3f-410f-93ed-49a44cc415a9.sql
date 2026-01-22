-- Create provisional account for unassigned entries (using valid account_type)
INSERT INTO public.accounting_accounts (name, account_type)
VALUES ('Cuenta Pendiente de Asignarse', 'Compras y gastos')
ON CONFLICT DO NOTHING;

-- Add column to track entries with provisional accounts
ALTER TABLE public.accounting_entries 
ADD COLUMN IF NOT EXISTS has_provisional_account BOOLEAN DEFAULT false;