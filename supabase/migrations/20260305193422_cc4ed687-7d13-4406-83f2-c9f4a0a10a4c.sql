
-- Fix budget_messages: replace permissive RLS with budget-scoped policies

-- Drop existing permissive policies on budget_messages
DROP POLICY IF EXISTS "Authenticated users can view budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can create budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can update budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Authenticated users can delete budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Users can view budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Users can create budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Users can update budget messages" ON public.budget_messages;
DROP POLICY IF EXISTS "Users can delete budget messages" ON public.budget_messages;

-- Create scoped policies for budget_messages
CREATE POLICY "Budget members can view messages"
  ON public.budget_messages FOR SELECT TO authenticated
  USING (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Budget members can insert messages"
  ON public.budget_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_presupuesto_access(auth.uid(), budget_id));

CREATE POLICY "Message owner or admin can update"
  ON public.budget_messages FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Message owner or admin can delete"
  ON public.budget_messages FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role));

-- Fix budget_message_recipients
DROP POLICY IF EXISTS "Authenticated users can view message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can create message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can update message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can delete message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Users can view message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Users can create message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Users can update message recipients" ON public.budget_message_recipients;
DROP POLICY IF EXISTS "Users can delete message recipients" ON public.budget_message_recipients;

CREATE POLICY "Budget members can view message recipients"
  ON public.budget_message_recipients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Budget members can insert message recipients"
  ON public.budget_message_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Message owner or admin can delete recipients"
  ON public.budget_message_recipients FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND (bm.created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role))
  ));

-- Fix budget_message_activities
DROP POLICY IF EXISTS "Authenticated users can view message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can create message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can update message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Authenticated users can delete message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Users can view message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Users can create message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Users can update message activities" ON public.budget_message_activities;
DROP POLICY IF EXISTS "Users can delete message activities" ON public.budget_message_activities;

CREATE POLICY "Budget members can view message activities"
  ON public.budget_message_activities FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Budget members can insert message activities"
  ON public.budget_message_activities FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Message owner or admin can delete activities"
  ON public.budget_message_activities FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND (bm.created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role))
  ));

-- Fix budget_message_resources
DROP POLICY IF EXISTS "Authenticated users can view message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can create message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can update message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Authenticated users can delete message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Users can view message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Users can create message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Users can update message resources" ON public.budget_message_resources;
DROP POLICY IF EXISTS "Users can delete message resources" ON public.budget_message_resources;

CREATE POLICY "Budget members can view message resources"
  ON public.budget_message_resources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Budget members can insert message resources"
  ON public.budget_message_resources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND public.has_presupuesto_access(auth.uid(), bm.budget_id)
  ));

CREATE POLICY "Message owner or admin can delete resources"
  ON public.budget_message_resources FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_messages bm
    WHERE bm.id = message_id
    AND (bm.created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'::public.app_role))
  ));
