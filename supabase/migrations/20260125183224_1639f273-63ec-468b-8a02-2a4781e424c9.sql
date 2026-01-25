-- Create table for resource trades/sectors (Oficios/Sectores)
CREATE TABLE public.resource_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resource_trades ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read trades
CREATE POLICY "Authenticated users can view trades"
ON public.resource_trades
FOR SELECT
TO authenticated
USING (true);

-- Allow all authenticated users to create trades
CREATE POLICY "Authenticated users can create trades"
ON public.resource_trades
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add trade_id column to external_resources
ALTER TABLE public.external_resources
ADD COLUMN trade_id UUID REFERENCES public.resource_trades(id) ON DELETE SET NULL;

-- Insert default trades
INSERT INTO public.resource_trades (name) VALUES
  ('Electricidad'),
  ('Fontanería'),
  ('Carpintería'),
  ('Albañilería'),
  ('Pintura'),
  ('Climatización'),
  ('Jardinería'),
  ('Cerrajería'),
  ('Cristalería'),
  ('Impermeabilización')
ON CONFLICT (name) DO NOTHING;