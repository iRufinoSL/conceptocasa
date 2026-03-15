
-- Clean stale duplicate polygons from transversal/longitudinal sections
-- by removing polygons whose IDs are NOT canonical (not in vertical sections)
-- and whose normalized names collide with canonical ones.
-- Strategy: Reset non-vertical section polygons to empty arrays so the fixed
-- auto-projection logic regenerates them correctly.
UPDATE budget_floor_plans fp
SET custom_corners = jsonb_set(
  fp.custom_corners,
  '{customSections}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN s->>'sectionType' IN ('transversal', 'longitudinal')
        THEN jsonb_set(s, '{polygons}', '[]'::jsonb)
        ELSE s
      END
    )
    FROM jsonb_array_elements(fp.custom_corners->'customSections') s
  )
)
FROM presupuestos p
WHERE fp.budget_id = p.id
AND p.nombre ILIKE '%Rodolfo%Carbay%'
AND jsonb_typeof(fp.custom_corners->'customSections') = 'array'
