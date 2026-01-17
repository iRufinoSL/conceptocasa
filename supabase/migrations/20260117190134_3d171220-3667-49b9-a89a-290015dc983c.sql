-- Add supplier_id column to budget_activity_resources table
ALTER TABLE public.budget_activity_resources
ADD COLUMN supplier_id uuid REFERENCES public.crm_contacts(id);

-- Create index for efficient supplier lookups
CREATE INDEX idx_budget_activity_resources_supplier_id ON public.budget_activity_resources(supplier_id);