-- Fix: Remove global unique constraint on invoice_number
-- Keep only the index that ensures unique numbers per document_type and year
ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_number_unique;