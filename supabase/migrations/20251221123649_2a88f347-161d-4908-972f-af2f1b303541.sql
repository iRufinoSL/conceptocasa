-- ============================================
-- Security Fix: Deny anonymous access to ALL tables
-- This creates a defense-in-depth baseline
-- ============================================

-- Budget tables
CREATE POLICY "Deny anonymous access" ON public.budget_activities FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_activity_files FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_activity_resources FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_concepts FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_contacts FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_items FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_measurement_relations FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_measurements FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_phases FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_predesigns FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_spaces FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_work_area_activities FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_work_area_measurements FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.budget_work_areas FOR ALL TO anon USING (false);

-- CRM tables
CREATE POLICY "Deny anonymous access" ON public.crm_activities FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_contact_activities FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_contact_professional_activities FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_contact_relations FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_contacts FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_management_contacts FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_managements FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_opportunities FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.crm_professional_activities FOR ALL TO anon USING (false);

-- Core tables
CREATE POLICY "Deny anonymous access" ON public.presupuestos FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.profiles FOR ALL TO anon USING (false);

-- Project tables
CREATE POLICY "Deny anonymous access" ON public.project_contacts FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.project_documents FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.project_predesigns FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.projects FOR ALL TO anon USING (false);

-- Settings tables
CREATE POLICY "Deny anonymous access" ON public.company_settings FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.tab_visibility_settings FOR ALL TO anon USING (false);

-- User access tables
CREATE POLICY "Deny anonymous access" ON public.user_activity_access FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.user_presupuestos FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.user_resource_access FOR ALL TO anon USING (false);
CREATE POLICY "Deny anonymous access" ON public.user_roles FOR ALL TO anon USING (false);