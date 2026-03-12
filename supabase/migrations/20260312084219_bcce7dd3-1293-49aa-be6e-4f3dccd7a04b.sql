
-- Add footer_contact_source to purchase_orders
ALTER TABLE public.purchase_orders 
ADD COLUMN footer_contact_source TEXT NOT NULL DEFAULT 'company';

-- Add footer_contact_source to invoices
ALTER TABLE public.invoices 
ADD COLUMN footer_contact_source TEXT NOT NULL DEFAULT 'company';
