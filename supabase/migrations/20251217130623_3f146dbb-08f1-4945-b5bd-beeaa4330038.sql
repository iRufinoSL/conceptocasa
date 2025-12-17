-- Add cover text style configuration fields to presupuestos
ALTER TABLE public.presupuestos
ADD COLUMN IF NOT EXISTS portada_text_color TEXT DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS portada_text_position TEXT DEFAULT 'center',
ADD COLUMN IF NOT EXISTS portada_overlay_opacity NUMERIC DEFAULT 0.4;