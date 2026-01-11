import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TabAdvancedSettings {
  recursos?: {
    viewModes?: string[];
    visibleColumns?: string[];
    showPhaseSubtotals?: boolean;
    showActivitySubtotals?: boolean;
    expandAll?: boolean;
    hideUnassignedPhase?: boolean;
  };
}

export interface TabVisibilitySettings {
  administrador: string[];
  colaborador: string[];
  cliente: string[];
}

export interface AdvancedSettingsByRole {
  administrador: TabAdvancedSettings;
  colaborador: TabAdvancedSettings;
  cliente: TabAdvancedSettings;
}

const DEFAULT_SETTINGS: TabVisibilitySettings = {
  administrador: ['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'documentos', 'agenda', 'resumen', 'contactos', 'config', 'recursos'],
  colaborador: ['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'documentos', 'agenda', 'contactos', 'config'],
  cliente: ['anteproyecto', 'cuanto-cuesta', 'actividades', 'fases', 'timeline', 'documentos', 'agenda', 'contactos']
};

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettingsByRole = {
  administrador: {
    recursos: {
      viewModes: ['alphabetical', 'grouped', 'workarea', 'time'],
      visibleColumns: ['activityId', 'usesMeasurement', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId', 'subtotal', 'files', 'actions'],
      showPhaseSubtotals: true,
      showActivitySubtotals: true,
      expandAll: false
    }
  },
  colaborador: {
    recursos: {
      viewModes: ['alphabetical', 'grouped', 'workarea', 'time'],
      visibleColumns: ['activityId', 'usesMeasurement', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId', 'subtotal', 'files', 'actions'],
      showPhaseSubtotals: true,
      showActivitySubtotals: true,
      expandAll: false
    }
  },
  cliente: {
    recursos: {
      viewModes: ['grouped'],
      visibleColumns: ['activityId', 'activity', 'phase', 'unit', 'relatedUnits', 'measurementId'],
      showPhaseSubtotals: true,
      showActivitySubtotals: true,
      expandAll: true
    }
  }
};

type AppRole = 'administrador' | 'colaborador' | 'cliente';

export function useTabVisibility() {
  const { roles } = useAuth();
  const [settings, setSettings] = useState<TabVisibilitySettings>(DEFAULT_SETTINGS);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettingsByRole>(DEFAULT_ADVANCED_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Get the primary role (highest privilege)
  const getUserRole = (): AppRole | null => {
    if (roles.includes('administrador')) return 'administrador';
    if (roles.includes('colaborador')) return 'colaborador';
    if (roles.includes('cliente')) return 'cliente';
    return null;
  };

  const userRole = getUserRole();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('tab_visibility_settings')
        .select('role, visible_tabs, advanced_settings');

      if (error) throw error;

      if (data && data.length > 0) {
        const newSettings: TabVisibilitySettings = { ...DEFAULT_SETTINGS };
        const newAdvanced: AdvancedSettingsByRole = { ...DEFAULT_ADVANCED_SETTINGS };
        
        data.forEach((item) => {
          const role = item.role as AppRole;
          if (role === 'administrador' || role === 'colaborador' || role === 'cliente') {
            // If the settings were created before we introduced new tabs (e.g. "agenda"),
            // ensure they're added by default so they show up.
            const visibleTabs = Array.isArray(item.visible_tabs) ? item.visible_tabs : [];
            const withAgenda = visibleTabs.includes('agenda') ? visibleTabs : [...visibleTabs, 'agenda'];
            newSettings[role] = withAgenda;

            if (item.advanced_settings && typeof item.advanced_settings === 'object') {
              newAdvanced[role] = item.advanced_settings as TabAdvancedSettings;
            }
          }
        });
        setSettings(newSettings);
        setAdvancedSettings(newAdvanced);
      }
    } catch (error) {
      console.error('Error fetching tab visibility settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (role: keyof TabVisibilitySettings, visibleTabs: string[]) => {
    try {
      const { error } = await supabase
        .from('tab_visibility_settings')
        .update({ visible_tabs: visibleTabs })
        .eq('role', role);

      if (error) throw error;

      setSettings(prev => ({
        ...prev,
        [role]: visibleTabs
      }));

      return true;
    } catch (error) {
      console.error('Error updating tab visibility settings:', error);
      return false;
    }
  };

  const isTabVisible = (tabId: string): boolean => {
    const userRole = getUserRole();
    if (!userRole) return false;
    
    // Admin always sees everything regardless of settings
    if (userRole === 'administrador') {
      return settings.administrador.includes(tabId);
    }
    
    const roleSettings = settings[userRole as keyof TabVisibilitySettings];
    return roleSettings ? roleSettings.includes(tabId) : false;
  };

  const getVisibleTabsForRole = (role: keyof TabVisibilitySettings): string[] => {
    return settings[role] || [];
  };

  const getAdvancedSettingsForRole = (role: keyof TabVisibilitySettings): TabAdvancedSettings => {
    return advancedSettings[role] || {};
  };

  // Get current user's advanced settings for a specific tab
  const getTabAdvancedSettings = (tabId: string): TabAdvancedSettings[keyof TabAdvancedSettings] | undefined => {
    const role = getUserRole();
    if (!role) return undefined;
    
    const roleAdvanced = advancedSettings[role];
    if (!roleAdvanced) return undefined;
    
    return roleAdvanced[tabId as keyof TabAdvancedSettings];
  };

  return {
    settings,
    advancedSettings,
    isLoading,
    isTabVisible,
    updateSettings,
    getVisibleTabsForRole,
    getAdvancedSettingsForRole,
    getTabAdvancedSettings,
    userRole,
    refetch: fetchSettings
  };
}
