-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number INTEGER NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  budget_id UUID REFERENCES public.presupuestos(id) ON DELETE SET NULL,
  issuer_account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE SET NULL,
  receiver_account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE SET NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 21.00,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number)
);

-- Create invoice_lines table
CREATE TABLE public.invoice_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  code INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  activity_id UUID REFERENCES public.budget_activities(id) ON DELETE SET NULL,
  units NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence for invoice line codes per invoice
CREATE OR REPLACE FUNCTION public.set_invoice_line_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = 1 THEN
    SELECT COALESCE(MAX(code), 0) + 1 INTO NEW.code
    FROM public.invoice_lines
    WHERE invoice_id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_invoice_line_code_trigger
BEFORE INSERT ON public.invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.set_invoice_line_code();

-- Trigger to update invoice totals when lines change
CREATE OR REPLACE FUNCTION public.update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_subtotal NUMERIC;
  v_vat_rate NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;
  
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.invoice_lines
  WHERE invoice_id = v_invoice_id;
  
  SELECT vat_rate INTO v_vat_rate
  FROM public.invoices
  WHERE id = v_invoice_id;
  
  UPDATE public.invoices
  SET subtotal = v_subtotal,
      vat_amount = v_subtotal * v_vat_rate / 100,
      total = v_subtotal + (v_subtotal * v_vat_rate / 100),
      updated_at = now()
  WHERE id = v_invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_invoice_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.update_invoice_totals();

-- Trigger to recalculate VAT when rate changes
CREATE OR REPLACE FUNCTION public.recalculate_invoice_vat()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vat_rate IS DISTINCT FROM OLD.vat_rate THEN
    NEW.vat_amount := NEW.subtotal * NEW.vat_rate / 100;
    NEW.total := NEW.subtotal + NEW.vat_amount;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER recalculate_invoice_vat_trigger
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_invoice_vat();

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices
CREATE POLICY "Deny anonymous access" ON public.invoices
FOR ALL USING (false);

CREATE POLICY "Admins can manage invoices" ON public.invoices
FOR ALL USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view invoices for their budgets" ON public.invoices
FOR SELECT USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_presupuesto_access(auth.uid(), budget_id)
);

-- RLS policies for invoice_lines
CREATE POLICY "Deny anonymous access" ON public.invoice_lines
FOR ALL USING (false);

CREATE POLICY "Admins can manage invoice lines" ON public.invoice_lines
FOR ALL USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Users can view invoice lines for their budgets" ON public.invoice_lines
FOR SELECT USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
    AND has_presupuesto_access(auth.uid(), i.budget_id)
  )
);

-- Create indexes for better performance
CREATE INDEX idx_invoices_budget_id ON public.invoices(budget_id);
CREATE INDEX idx_invoices_issuer_account_id ON public.invoices(issuer_account_id);
CREATE INDEX idx_invoices_receiver_account_id ON public.invoices(receiver_account_id);
CREATE INDEX idx_invoice_lines_invoice_id ON public.invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_activity_id ON public.invoice_lines(activity_id);