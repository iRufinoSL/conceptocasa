import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface AppAccessItem {
  app_name: string;
  can_access: boolean;
}

export interface TabAccessItem {
  app_name: string;
  tab_name: string;
  can_view: boolean;
  can_edit: boolean;
}

export interface FieldAccessItem {
  table_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
}

export interface ModelUser {
  id: string;
  user_id: string;
  description: string | null;
  role_type: string;
  is_active: boolean;
  profile?: {
    email: string;
    full_name: string | null;
  };
}

// Definición de todas las aplicaciones del sistema
export const SYSTEM_APPS = [
  { name: 'dashboard', label: 'Dashboard', adminOnly: false },
  { name: 'presupuestos', label: 'Presupuestos', adminOnly: false },
  { name: 'crm', label: 'CRM', adminOnly: false },
  { name: 'agenda', label: 'Agenda', adminOnly: false },
  { name: 'documentos', label: 'Documentos', adminOnly: false },
  { name: 'recursos', label: 'Recursos', adminOnly: true },
  { name: 'usuarios', label: 'Usuarios', adminOnly: true },
  { name: 'configuracion', label: 'Configuración', adminOnly: true },
  { name: 'administracion', label: 'Administración', adminOnly: true },
] as const;

// Definición de tabs por aplicación
export const APP_TABS: Record<string, { name: string; label: string }[]> = {
  presupuestos: [
    { name: 'resumen', label: 'Resumen' },
    { name: 'actividades', label: 'Actividades' },
    { name: 'recursos', label: 'Recursos' },
    { name: 'mediciones', label: 'Mediciones' },
    { name: 'fases', label: 'Fases' },
    { name: 'espacios', label: 'Espacios' },
    { name: 'zonas', label: 'Zonas de Trabajo' },
    { name: 'ante-proyecto', label: 'Ante-proyecto' },
    { name: 'urbanismo', label: 'Urbanismo' },
    { name: 'documentos', label: 'Documentos' },
    { name: 'comunicaciones', label: 'Comunicaciones' },
    { name: 'agenda', label: 'Agenda' },
    { name: 'contactos', label: 'Contactos' },
    { name: 'partes', label: 'Partes de Trabajo' },
  ],
  crm: [
    { name: 'contactos', label: 'Contactos' },
    { name: 'oportunidades', label: 'Oportunidades' },
    { name: 'gestiones', label: 'Gestiones' },
    { name: 'comunicaciones', label: 'Comunicaciones' },
    { name: 'plantillas', label: 'Plantillas Email' },
    { name: 'tickets', label: 'Tickets' },
    { name: 'analytics', label: 'Analytics Web' },
  ],
  administracion: [
    { name: 'cuentas', label: 'Cuentas' },
    { name: 'asientos', label: 'Asientos' },
    { name: 'apuntes', label: 'Apuntes' },
    { name: 'facturas', label: 'Facturas' },
    { name: 'balance', label: 'Balance' },
    { name: 'iva', label: 'IVA' },
  ],
};

// Campos sensibles por tabla
export const SENSITIVE_FIELDS: Record<string, { name: string; label: string }[]> = {
  budget_activity_resources: [
    { name: 'external_unit_cost', label: 'Coste ud. externa (€)' },
    { name: 'safety_margin_percent', label: 'Margen seguridad (%)' },
    { name: 'sales_margin_percent', label: 'Margen venta (%)' },
    { name: 'signed_subtotal', label: 'Subtotal firmado (€)' },
  ],
  presupuestos: [
    { name: 'total_cost', label: 'Coste total' },
    { name: 'margin', label: 'Margen' },
  ],
};

export function useAppAccess() {
  const { user, isAdmin } = useAuth();
  const [appAccess, setAppAccess] = useState<AppAccessItem[]>([]);
  const [tabAccess, setTabAccess] = useState<TabAccessItem[]>([]);
  const [fieldAccess, setFieldAccess] = useState<FieldAccessItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAccess = async () => {
      if (!user) {
        setAppAccess([]);
        setTabAccess([]);
        setFieldAccess([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [appRes, tabRes, fieldRes] = await Promise.all([
          supabase
            .from('user_app_access')
            .select('app_name, can_access')
            .eq('user_id', user.id),
          supabase
            .from('user_tab_access')
            .select('app_name, tab_name, can_view, can_edit')
            .eq('user_id', user.id),
          supabase
            .from('user_field_access')
            .select('table_name, field_name, can_view, can_edit')
            .eq('user_id', user.id),
        ]);

        setAppAccess((appRes.data as AppAccessItem[]) || []);
        setTabAccess((tabRes.data as TabAccessItem[]) || []);
        setFieldAccess((fieldRes.data as FieldAccessItem[]) || []);
      } catch (error) {
        console.error('Error fetching access:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccess();
  }, [user]);

  const hasAppAccess = useCallback((appName: string): boolean => {
    // Admins tienen acceso a todo
    if (isAdmin()) return true;
    
    const access = appAccess.find(a => a.app_name === appName);
    return access?.can_access ?? false;
  }, [isAdmin, appAccess]);

  const hasTabAccess = useCallback((appName: string, tabName: string, accessType: 'view' | 'edit' = 'view'): boolean => {
    // Admins tienen acceso a todo
    if (isAdmin()) return true;
    
    const access = tabAccess.find(t => t.app_name === appName && t.tab_name === tabName);
    if (!access) return false;
    
    return accessType === 'view' ? access.can_view : access.can_edit;
  }, [isAdmin, tabAccess]);

  const hasFieldAccess = useCallback((tableName: string, fieldName: string, accessType: 'view' | 'edit' = 'view'): boolean => {
    // Admins tienen acceso a todo
    if (isAdmin()) return true;
    
    const access = fieldAccess.find(f => f.table_name === tableName && f.field_name === fieldName);
    if (!access) return false;
    
    return accessType === 'view' ? access.can_view : access.can_edit;
  }, [isAdmin, fieldAccess]);

  // Get list of accessible apps for navigation
  const accessibleApps = useMemo(() => {
    if (isAdmin()) {
      return SYSTEM_APPS.map(app => app.name);
    }
    return appAccess.filter(a => a.can_access).map(a => a.app_name);
  }, [isAdmin, appAccess]);

  // Get list of accessible tabs for a specific app
  const getAccessibleTabs = useCallback((appName: string): string[] => {
    if (isAdmin()) {
      return APP_TABS[appName]?.map(t => t.name) || [];
    }
    return tabAccess
      .filter(t => t.app_name === appName && t.can_view)
      .map(t => t.tab_name);
  }, [isAdmin, tabAccess]);

  return {
    appAccess,
    tabAccess,
    fieldAccess,
    isLoading,
    hasAppAccess,
    hasTabAccess,
    hasFieldAccess,
    accessibleApps,
    getAccessibleTabs,
  };
}

// Hook para gestionar usuarios modelo
export function useModelUsers() {
  const [modelUsers, setModelUsers] = useState<ModelUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModelUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('model_users')
        .select(`
          id,
          user_id,
          description,
          role_type,
          is_active
        `)
        .eq('is_active', true)
        .order('role_type');

      if (error) throw error;

      // Fetch profiles for each model user
      if (data && data.length > 0) {
        const userIds = data.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        const enrichedData = data.map(m => ({
          ...m,
          profile: profiles?.find(p => p.id === m.user_id) || undefined,
        }));

        setModelUsers(enrichedData);
      } else {
        setModelUsers([]);
      }
    } catch (error) {
      console.error('Error fetching model users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModelUsers();
  }, []);

  return {
    modelUsers,
    isLoading,
    refetch: fetchModelUsers,
  };
}
