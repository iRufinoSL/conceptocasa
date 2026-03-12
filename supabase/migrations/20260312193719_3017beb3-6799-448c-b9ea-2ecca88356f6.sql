
-- Fix: Add WITH CHECK to the existing policy so INSERT/UPDATE are allowed
DROP POLICY "Users with budget access can manage walls" ON public.budget_floor_plan_walls;

CREATE POLICY "Users with budget access can manage walls"
ON public.budget_floor_plan_walls FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM budget_floor_plan_rooms r
    JOIN budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE r.id = budget_floor_plan_walls.room_id
    AND has_presupuesto_access(auth.uid(), fp.budget_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM budget_floor_plan_rooms r
    JOIN budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE r.id = budget_floor_plan_walls.room_id
    AND has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);
