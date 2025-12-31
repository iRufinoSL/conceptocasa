-- Update the budget_contacts table to allow 'otros' as a contact_role
-- First, let's check the current constraint and update it to include 'otros'

-- We'll simply allow any text value for contact_role since PostgreSQL doesn't have a strict enum here
-- The roles will be: 'cliente', 'proveedor', 'otros'
-- No schema change needed as contact_role is a text field without constraint

-- Just add a comment for documentation
COMMENT ON COLUMN public.budget_contacts.contact_role IS 'Role of the contact in the budget: cliente, proveedor, or otros';