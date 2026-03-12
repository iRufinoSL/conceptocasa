
-- Purchase Orders table (mirrors invoices structure)
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number INTEGER NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  order_id TEXT GENERATED ALWAYS AS (
    LPAD(order_number::text, 4, '0') || '/' || LPAD(EXTRACT(MONTH FROM order_date)::text, 2, '0') || '/' || LPAD((EXTRACT(YEAR FROM order_date)::integer % 100)::text, 2, '0')
  ) STORED,
  description TEXT,
  observations TEXT,
  budget_id UUID REFERENCES public.presupuestos(id),
  supplier_contact_id UUID REFERENCES public.crm_contacts(id),
  client_contact_id UUID REFERENCES public.crm_contacts(id),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 21,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_number, order_date)
);

-- Purchase Order Lines table (mirrors invoice_lines)
CREATE TABLE public.purchase_order_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  code INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  activity_id UUID REFERENCES public.budget_activities(id),
  units NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for purchase_orders
CREATE POLICY "Admins and collaborators can manage purchase orders"
ON public.purchase_orders
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- RLS policies for purchase_order_lines
CREATE POLICY "Admins and collaborators can manage purchase order lines"
ON public.purchase_order_lines
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::public.app_role) OR
  public.has_role(auth.uid(), 'colaborador'::public.app_role)
);

-- Auto-set line code
CREATE OR REPLACE FUNCTION public.set_purchase_order_line_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = 1 THEN
    SELECT COALESCE(MAX(code), 0) + 1 INTO NEW.code
    FROM public.purchase_order_lines
    WHERE purchase_order_id = NEW.purchase_order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_purchase_order_line_code_trigger
BEFORE INSERT ON public.purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_line_code();

-- Auto-update totals when lines change
CREATE OR REPLACE FUNCTION public.update_purchase_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id UUID;
  v_subtotal NUMERIC;
  v_vat_rate NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.purchase_order_id;
  ELSE
    v_order_id := NEW.purchase_order_id;
  END IF;
  
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.purchase_order_lines
  WHERE purchase_order_id = v_order_id;
  
  SELECT vat_rate INTO v_vat_rate
  FROM public.purchase_orders
  WHERE id = v_order_id;
  
  UPDATE public.purchase_orders
  SET subtotal = v_subtotal,
      vat_amount = CASE WHEN v_vat_rate = -1 THEN 0 ELSE v_subtotal * v_vat_rate / 100 END,
      total = CASE WHEN v_vat_rate = -1 THEN v_subtotal ELSE v_subtotal + (v_subtotal * v_vat_rate / 100) END,
      updated_at = now()
  WHERE id = v_order_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_purchase_order_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION public.update_purchase_order_totals();
