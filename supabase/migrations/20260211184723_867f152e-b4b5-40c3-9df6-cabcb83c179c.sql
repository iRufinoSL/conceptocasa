
-- Fix budget_messages RLS: replace permissive policies with budget-scoped access

-- Drop existing permissive policies on budget_messages
DROP POLICY IF EXISTS "Authenticated users can view budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can create budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can update budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can delete budget messages" ON public.budget_messages;

-- Create proper budget-scoped policies
CREATE POLICY "Users can view messages in their budgets"
  ON public.budget_messages FOR SELECT
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users can create messages in their budgets"
  ON public.budget_messages FOR INSERT
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users can update messages in their budgets"
  ON public.budget_messages FOR UPDATE
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users can delete messages in their budgets"
  ON public.budget_messages FOR DELETE
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- Fix budget_message_recipients
DROP POLICY IF EXISTS "Authenticated users can view message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can create message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can update message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can delete message recipients" ON public.budget_message_recipients;

CREATE POLICY "Users can view recipients in their budget messages"
  ON public.budget_message_recipients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can create recipients in their budget messages"
  ON public.budget_message_recipients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can update recipients in their budget messages"
  ON public.budget_message_recipients FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can delete recipients in their budget messages"
  ON public.budget_message_recipients FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

-- Fix budget_message_activities
DROP POLICY IF EXISTS "Authenticated users can view message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can create message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can update message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can delete message activities" ON public.budget_message_activities;

CREATE POLICY "Users can view activities in their budget messages"
  ON public.budget_message_activities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can create activities in their budget messages"
  ON public.budget_message_activities FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can update activities in their budget messages"
  ON public.budget_message_activities FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can delete activities in their budget messages"
  ON public.budget_message_activities FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

-- Fix budget_message_resources
DROP POLICY IF EXISTS "Authenticated users can view message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can create message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can update message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can delete message resources" ON public.budget_message_resources;

CREATE POLICY "Users can view resources in their budget messages"
  ON public.budget_message_resources FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can create resources in their budget messages"
  ON public.budget_message_resources FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can update resources in their budget messages"
  ON public.budget_message_resources FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users can delete resources in their budget messages"
  ON public.budget_message_resources FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));
