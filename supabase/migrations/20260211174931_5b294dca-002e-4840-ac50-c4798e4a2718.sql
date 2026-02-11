
-- Fix budget_messages: replace permissive policies with budget-scoped access

-- budget_messages
DROP POLICY IF EXISTS "Authenticated users can view budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can create budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can update budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can delete budget messages" ON public.budget_messages;

CREATE POLICY "Users with budget access can view messages"
  ON public.budget_messages FOR SELECT
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can create messages"
  ON public.budget_messages FOR INSERT
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can update messages"
  ON public.budget_messages FOR UPDATE
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Users with budget access can delete messages"
  ON public.budget_messages FOR DELETE
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

-- budget_message_recipients (join table - check via message's budget_id)
DROP POLICY IF EXISTS "Authenticated users can view message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can manage message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can delete message recipients" ON public.budget_message_recipients;

CREATE POLICY "Users with budget access can view message recipients"
  ON public.budget_message_recipients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can manage message recipients"
  ON public.budget_message_recipients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can delete message recipients"
  ON public.budget_message_recipients FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

-- budget_message_activities
DROP POLICY IF EXISTS "Authenticated users can view message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can manage message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can update message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can delete message activities" ON public.budget_message_activities;

CREATE POLICY "Users with budget access can view message activities"
  ON public.budget_message_activities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can manage message activities"
  ON public.budget_message_activities FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can update message activities"
  ON public.budget_message_activities FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can delete message activities"
  ON public.budget_message_activities FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

-- budget_message_resources
DROP POLICY IF EXISTS "Authenticated users can view message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can manage message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can update message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can delete message resources" ON public.budget_message_resources;

CREATE POLICY "Users with budget access can view message resources"
  ON public.budget_message_resources FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can manage message resources"
  ON public.budget_message_resources FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can update message resources"
  ON public.budget_message_resources FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Users with budget access can delete message resources"
  ON public.budget_message_resources FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));
