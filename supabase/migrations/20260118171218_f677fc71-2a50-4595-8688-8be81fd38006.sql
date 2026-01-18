-- Add is_signed field to presupuestos table
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS is_signed boolean NOT NULL DEFAULT false;

-- Add signed_subtotal field to budget_activity_resources table
-- This will be populated when the budget is marked as signed and cannot be changed after
ALTER TABLE public.budget_activity_resources 
ADD COLUMN IF NOT EXISTS signed_subtotal numeric DEFAULT NULL;

-- Add signed_at timestamp to presupuestos to track when it was signed
ALTER TABLE public.presupuestos 
ADD COLUMN IF NOT EXISTS signed_at timestamp with time zone DEFAULT NULL;

-- Create function to lock signed_subtotal after it's set
CREATE OR REPLACE FUNCTION public.prevent_signed_subtotal_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If the old value is NOT NULL and the new value is different, prevent the change
  IF OLD.signed_subtotal IS NOT NULL AND NEW.signed_subtotal IS DISTINCT FROM OLD.signed_subtotal THEN
    RAISE EXCEPTION 'Cannot modify signed_subtotal once it has been set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent signed_subtotal changes
DROP TRIGGER IF EXISTS prevent_signed_subtotal_change ON public.budget_activity_resources;
CREATE TRIGGER prevent_signed_subtotal_change
  BEFORE UPDATE ON public.budget_activity_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_signed_subtotal_update();