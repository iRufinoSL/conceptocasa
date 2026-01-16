-- Añadir campo de conclusión rápida: si el terreno es edificable o no
ALTER TABLE public.urban_profiles
  ADD COLUMN IF NOT EXISTS is_buildable BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_buildable_source TEXT;

-- Relleno inicial basado en la calificación existente (cuando sea posible)
UPDATE public.urban_profiles
SET
  is_buildable = CASE
    WHEN land_class IN ('Urbano', 'Urbanizable') THEN TRUE
    WHEN land_class IN ('Rústico', 'No Urbanizable') THEN FALSE
    ELSE NULL
  END,
  is_buildable_source = COALESCE(is_buildable_source, 'Derivado de la calificación (Catastro)')
WHERE is_buildable IS NULL
  AND land_class IS NOT NULL;