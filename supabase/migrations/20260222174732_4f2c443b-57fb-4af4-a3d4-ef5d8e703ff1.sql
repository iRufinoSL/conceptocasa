
-- Fix: Replace overly permissive RLS policy on budget_floor_plan_block_groups
DROP POLICY IF EXISTS "Users can manage block groups" ON public.budget_floor_plan_block_groups;

CREATE POLICY "Budget-scoped floor plan block access"
ON public.budget_floor_plan_block_groups
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plan_walls w
    JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
    JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE w.id = wall_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.budget_floor_plan_walls w
    JOIN public.budget_floor_plan_rooms r ON r.id = w.room_id
    JOIN public.budget_floor_plans fp ON fp.id = r.floor_plan_id
    WHERE w.id = wall_id
    AND public.has_presupuesto_access(auth.uid(), fp.budget_id)
  )
);
