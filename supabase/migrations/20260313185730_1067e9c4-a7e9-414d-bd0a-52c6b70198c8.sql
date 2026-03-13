
-- Create accounting_ledgers table
CREATE TABLE public.accounting_ledgers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  operations_start_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accounting_ledgers ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins and colaboradores
CREATE POLICY "Admins can manage ledgers" ON public.accounting_ledgers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'colaborador'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'::public.app_role) OR public.has_role(auth.uid(), 'colaborador'::public.app_role));

-- Add ledger_id to accounting tables
ALTER TABLE public.accounting_entries ADD COLUMN ledger_id UUID REFERENCES public.accounting_ledgers(id);
ALTER TABLE public.accounting_accounts ADD COLUMN ledger_id UUID REFERENCES public.accounting_ledgers(id);
ALTER TABLE public.invoices ADD COLUMN ledger_id UUID REFERENCES public.accounting_ledgers(id);
ALTER TABLE public.purchase_orders ADD COLUMN ledger_id UUID REFERENCES public.accounting_ledgers(id);
