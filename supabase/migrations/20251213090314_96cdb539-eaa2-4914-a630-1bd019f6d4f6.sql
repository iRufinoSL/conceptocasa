-- =====================================================
-- CRM MODULE: Activities and Professional Categories
-- =====================================================

-- Professional activities (categories for contacts)
CREATE TABLE public.crm_professional_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Contact activities (types like Arquitecto, Constructor, etc.)
CREATE TABLE public.crm_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- CRM MODULE: Contacts
-- =====================================================

CREATE TABLE public.crm_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  surname TEXT,
  contact_type TEXT NOT NULL DEFAULT 'Persona', -- Persona, Entidad
  status TEXT NOT NULL DEFAULT 'Prospecto', -- Prospecto, Negociación, Cliente
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  country TEXT,
  postal_code TEXT,
  website TEXT,
  nif_dni TEXT,
  observations TEXT,
  professional_activity_id UUID REFERENCES public.crm_professional_activities(id),
  tags TEXT[] DEFAULT '{}',
  logo_path TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Junction table: Contact to Activities (many-to-many)
CREATE TABLE public.crm_contact_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.crm_activities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_id, activity_id)
);

-- Contact relations (contacts related to other contacts)
CREATE TABLE public.crm_contact_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id_a UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  contact_id_b UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_id_a, contact_id_b)
);

-- =====================================================
-- CRM MODULE: Opportunities and Managements
-- =====================================================

CREATE TABLE public.crm_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.crm_managements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  management_type TEXT NOT NULL DEFAULT 'Tarea', -- Tarea, Reunión, Llamada, etc.
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  start_time TIME,
  end_time TIME,
  status TEXT NOT NULL DEFAULT 'Pendiente', -- Pendiente, En progreso, Completada
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Junction table: Management to Contacts
CREATE TABLE public.crm_management_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  management_id UUID NOT NULL REFERENCES public.crm_managements(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(management_id, contact_id)
);

-- =====================================================
-- PROJECTS MODULE
-- =====================================================

CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, on_hold, cancelled
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  location TEXT,
  project_type TEXT, -- Obra nueva, Reforma, etc.
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Project contacts (associates contacts to projects with roles)
CREATE TABLE public.project_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  contact_role TEXT DEFAULT 'Contacto',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(project_id, contact_id)
);

-- Project documents
CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  document_type TEXT,
  document_url TEXT,
  visible_to TEXT[] DEFAULT '{admin}',
  tags TEXT[] DEFAULT '{}',
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Project predesigns (images, renderings)
CREATE TABLE public.project_predesigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  category TEXT, -- Planos, Perspectivas, Alzados, etc.
  description TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- BUDGETS MODULE (Extended)
-- =====================================================

-- Budget phases
CREATE TABLE public.budget_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  order_index INTEGER DEFAULT 0,
  parent_id UUID REFERENCES public.budget_phases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Budget items (measurements)
CREATE TABLE public.budget_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity DECIMAL(15,4),
  unit TEXT,
  workspace_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Budget concepts (line items)
CREATE TABLE public.budget_concepts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.budget_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  measurement_id UUID REFERENCES public.budget_items(id) ON DELETE SET NULL,
  workspace_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Budget activity resources (resources used in budget activities)
CREATE TABLE public.budget_activity_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID REFERENCES public.budget_concepts(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT,
  external_unit_cost DECIMAL(15,4),
  resource_type TEXT, -- Producto, Mano de obra, Servicio, Alquiler
  safety_margin_percent DECIMAL(5,2) DEFAULT 15,
  sales_margin_percent DECIMAL(5,2) DEFAULT 25,
  manual_units DECIMAL(15,4),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.crm_professional_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_managements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_management_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_predesigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_activity_resources ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: Admins have full access, authenticated users can read
-- =====================================================

-- CRM Professional Activities
CREATE POLICY "Admins can manage professional activities" ON public.crm_professional_activities FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view professional activities" ON public.crm_professional_activities FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Activities
CREATE POLICY "Admins can manage activities" ON public.crm_activities FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view activities" ON public.crm_activities FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Contacts
CREATE POLICY "Admins can manage contacts" ON public.crm_contacts FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view contacts" ON public.crm_contacts FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Contact Activities
CREATE POLICY "Admins can manage contact activities" ON public.crm_contact_activities FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view contact activities" ON public.crm_contact_activities FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Contact Relations
CREATE POLICY "Admins can manage contact relations" ON public.crm_contact_relations FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view contact relations" ON public.crm_contact_relations FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Opportunities
CREATE POLICY "Admins can manage opportunities" ON public.crm_opportunities FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view opportunities" ON public.crm_opportunities FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Managements
CREATE POLICY "Admins can manage managements" ON public.crm_managements FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view managements" ON public.crm_managements FOR SELECT USING (auth.uid() IS NOT NULL);

-- CRM Management Contacts
CREATE POLICY "Admins can manage management contacts" ON public.crm_management_contacts FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view management contacts" ON public.crm_management_contacts FOR SELECT USING (auth.uid() IS NOT NULL);

-- Projects
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view projects" ON public.projects FOR SELECT USING (auth.uid() IS NOT NULL);

-- Project Contacts
CREATE POLICY "Admins can manage project contacts" ON public.project_contacts FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view project contacts" ON public.project_contacts FOR SELECT USING (auth.uid() IS NOT NULL);

-- Project Documents
CREATE POLICY "Admins can manage project documents" ON public.project_documents FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view project documents" ON public.project_documents FOR SELECT USING (auth.uid() IS NOT NULL);

-- Project Predesigns
CREATE POLICY "Admins can manage project predesigns" ON public.project_predesigns FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Authenticated users can view project predesigns" ON public.project_predesigns FOR SELECT USING (auth.uid() IS NOT NULL);

-- Budget Phases
CREATE POLICY "Admins can manage budget phases" ON public.budget_phases FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Users can view budget phases for their presupuestos" ON public.budget_phases FOR SELECT USING (
  has_role(auth.uid(), 'administrador') OR 
  has_presupuesto_access(auth.uid(), budget_id)
);

-- Budget Items
CREATE POLICY "Admins can manage budget items" ON public.budget_items FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Users can view budget items for their presupuestos" ON public.budget_items FOR SELECT USING (
  has_role(auth.uid(), 'administrador') OR 
  has_presupuesto_access(auth.uid(), budget_id)
);

-- Budget Concepts
CREATE POLICY "Admins can manage budget concepts" ON public.budget_concepts FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Users can view budget concepts for their presupuestos" ON public.budget_concepts FOR SELECT USING (
  has_role(auth.uid(), 'administrador') OR 
  has_presupuesto_access(auth.uid(), budget_id)
);

-- Budget Activity Resources
CREATE POLICY "Admins can manage budget activity resources" ON public.budget_activity_resources FOR ALL USING (has_role(auth.uid(), 'administrador'));
CREATE POLICY "Users can view budget activity resources for their presupuestos" ON public.budget_activity_resources FOR SELECT USING (
  has_role(auth.uid(), 'administrador') OR 
  has_presupuesto_access(auth.uid(), budget_id)
);

-- =====================================================
-- TRIGGERS: Auto-update updated_at
-- =====================================================

CREATE TRIGGER update_crm_contacts_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_opportunities_updated_at BEFORE UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_managements_updated_at BEFORE UPDATE ON public.crm_managements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budget_phases_updated_at BEFORE UPDATE ON public.budget_phases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budget_items_updated_at BEFORE UPDATE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budget_concepts_updated_at BEFORE UPDATE ON public.budget_concepts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budget_activity_resources_updated_at BEFORE UPDATE ON public.budget_activity_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();