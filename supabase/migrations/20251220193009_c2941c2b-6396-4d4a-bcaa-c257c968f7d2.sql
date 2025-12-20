-- Add advanced_settings column for more granular configuration per role
ALTER TABLE public.tab_visibility_settings
ADD COLUMN IF NOT EXISTS advanced_settings JSONB DEFAULT '{}'::jsonb;

-- Update default settings for cliente role with CÓMO? restrictions
UPDATE public.tab_visibility_settings
SET 
  visible_tabs = ARRAY['anteproyecto', 'cuanto-cuesta', 'actividades', 'fases', 'timeline', 'mediciones', 'espacios', 'contactos', 'recursos'],
  advanced_settings = jsonb_build_object(
    'recursos', jsonb_build_object(
      'viewModes', ARRAY['grouped'],
      'visibleColumns', ARRAY['activityId', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId'],
      'showPhaseSubtotals', true,
      'showActivitySubtotals', true,
      'expandAll', true
    )
  )
WHERE role = 'cliente';

-- Set default advanced_settings for administrador (all access)
UPDATE public.tab_visibility_settings
SET advanced_settings = jsonb_build_object(
  'recursos', jsonb_build_object(
    'viewModes', ARRAY['alphabetical', 'grouped', 'workarea', 'time'],
    'visibleColumns', ARRAY['activityId', 'usesMeasurement', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId', 'subtotal', 'files', 'actions'],
    'showPhaseSubtotals', true,
    'showActivitySubtotals', true,
    'expandAll', false
  )
)
WHERE role = 'administrador';

-- Set default advanced_settings for colaborador
UPDATE public.tab_visibility_settings
SET advanced_settings = jsonb_build_object(
  'recursos', jsonb_build_object(
    'viewModes', ARRAY['alphabetical', 'grouped', 'workarea', 'time'],
    'visibleColumns', ARRAY['activityId', 'usesMeasurement', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId', 'subtotal', 'files', 'actions'],
    'showPhaseSubtotals', true,
    'showActivitySubtotals', true,
    'expandAll', false
  )
)
WHERE role = 'colaborador';