
-- Create accounting accounts table (Cuentas Contables)
CREATE TABLE public.accounting_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Compras y gastos', 'Ventas e ingresos', 'Clientes', 'Proveedores', 'Impuestos', 'Tesorería')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create journal entries table (Asientos)
CREATE TABLE public.accounting_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code SERIAL NOT NULL UNIQUE,
  description TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create journal entry lines table (Apuntes)
CREATE TABLE public.accounting_entry_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code SERIAL NOT NULL,
  entry_id UUID NOT NULL REFERENCES public.accounting_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  line_date DATE NOT NULL,
  description TEXT,
  debit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT positive_amounts CHECK (debit_amount >= 0 AND credit_amount >= 0),
  CONSTRAINT one_side_only CHECK ((debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0) OR (debit_amount = 0 AND credit_amount = 0))
);

-- Enable RLS
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entry_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounting_accounts
CREATE POLICY "Deny anonymous access" ON public.accounting_accounts FOR ALL USING (false);
CREATE POLICY "Admins can manage accounting accounts" ON public.accounting_accounts FOR ALL USING (has_role(auth.uid(), 'administrador'::app_role));
CREATE POLICY "Authenticated users can view accounting accounts" ON public.accounting_accounts FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS Policies for accounting_entries
CREATE POLICY "Deny anonymous access" ON public.accounting_entries FOR ALL USING (false);
CREATE POLICY "Admins can manage accounting entries" ON public.accounting_entries FOR ALL USING (has_role(auth.uid(), 'administrador'::app_role));
CREATE POLICY "Users can view entries for their budgets" ON public.accounting_entries FOR SELECT USING (
  has_role(auth.uid(), 'administrador'::app_role) OR has_presupuesto_access(auth.uid(), budget_id)
);

-- RLS Policies for accounting_entry_lines
CREATE POLICY "Deny anonymous access" ON public.accounting_entry_lines FOR ALL USING (false);
CREATE POLICY "Admins can manage entry lines" ON public.accounting_entry_lines FOR ALL USING (has_role(auth.uid(), 'administrador'::app_role));
CREATE POLICY "Users can view lines for their budget entries" ON public.accounting_entry_lines FOR SELECT USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  EXISTS (
    SELECT 1 FROM public.accounting_entries ae 
    WHERE ae.id = accounting_entry_lines.entry_id 
    AND has_presupuesto_access(auth.uid(), ae.budget_id)
  )
);

-- Create indexes for performance
CREATE INDEX idx_accounting_entries_budget_id ON public.accounting_entries(budget_id);
CREATE INDEX idx_accounting_entries_entry_date ON public.accounting_entries(entry_date);
CREATE INDEX idx_accounting_entry_lines_entry_id ON public.accounting_entry_lines(entry_id);
CREATE INDEX idx_accounting_entry_lines_account_id ON public.accounting_entry_lines(account_id);

-- Create trigger for updated_at
CREATE TRIGGER update_accounting_accounts_updated_at
  BEFORE UPDATE ON public.accounting_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounting_entries_updated_at
  BEFORE UPDATE ON public.accounting_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounting_entry_lines_updated_at
  BEFORE UPDATE ON public.accounting_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
