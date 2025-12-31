-- Drop the existing check constraint and recreate it with 'otros' included
ALTER TABLE public.budget_contacts DROP CONSTRAINT IF EXISTS budget_contacts_contact_role_check;

ALTER TABLE public.budget_contacts ADD CONSTRAINT budget_contacts_contact_role_check 
CHECK (contact_role IN ('cliente', 'proveedor', 'otros'));