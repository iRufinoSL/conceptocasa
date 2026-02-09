
-- Fix search_path on non-SECURITY DEFINER functions for best practice
CREATE OR REPLACE FUNCTION public.prevent_signed_subtotal_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF OLD.signed_subtotal IS NOT NULL AND NEW.signed_subtotal IS DISTINCT FROM OLD.signed_subtotal THEN
    RAISE EXCEPTION 'Cannot modify signed_subtotal once it has been set';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_invoice_vat()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF NEW.vat_rate IS DISTINCT FROM OLD.vat_rate THEN
    NEW.vat_amount := NEW.subtotal * NEW.vat_rate / 100;
    NEW.total := NEW.subtotal + NEW.vat_amount;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_invoice_line_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF NEW.code IS NULL OR NEW.code = 1 THEN
    SELECT COALESCE(MAX(code), 0) + 1 INTO NEW.code
    FROM public.invoice_lines
    WHERE invoice_id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
$function$;
