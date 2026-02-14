
-- Add DÓNDE fields (address, coordinates, cadastral)
ALTER TABLE public.tolosa_items
  ADD COLUMN address_street TEXT,
  ADD COLUMN address_postal_code TEXT,
  ADD COLUMN address_province TEXT,
  ADD COLUMN latitude DOUBLE PRECISION,
  ADD COLUMN longitude DOUBLE PRECISION,
  ADD COLUMN cadastral_reference TEXT;

-- Add QUIÉN fields (client and main supplier contacts)
ALTER TABLE public.tolosa_items
  ADD COLUMN client_contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN supplier_contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

-- Add CÓMO field (housing profile reference)
ALTER TABLE public.tolosa_items
  ADD COLUMN housing_profile_id UUID;
