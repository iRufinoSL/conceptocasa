import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TabVisibilitySettings {
  administrador: string[];
  colaborador: string[];
  cliente: string[];
}

const DEFAULT_SETTINGS: TabVisibilitySettings = {
  administrador: ['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'resumen', 'contactos', 'config', 'recursos'],
  colaborador: ['anteproyecto', 'cuanto-cuesta', 'actividades', 'zonas', 'fases', 'timeline', 'mediciones', 'espacios', 'contactos', 'config'],
  cliente: ['anteproyecto', 'cuanto-cuesta', 'actividades', 'fases', 'timeline', 'contactos']
};

type AppRole = 'administrador' | 'colaborador' | 'cliente';

export function useTabVisibility() {
  const { roles } = useAuth();
  const [settings, setSettings] = useState<TabVisibilitySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Get the primary role (highest privilege)
  const getUserRole = (): AppRole | null => {
    if (roles.includes('administrador')) return 'administrador';
    if (roles.includes('colaborador')) return 'colaborador';
    if (roles.includes('cliente')) return 'cliente';
    return null;
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('tab_visibility_settings')
        .select('role, visible_tabs');

      if (error) throw error;

      if (data && data.length > 0) {
        const newSettings: TabVisibilitySettings = { ...DEFAULT_SETTINGS };
        data.forEach((item: { role: string; visible_tabs: string[] }) => {
          if (item.role === 'administrador' || item.role === 'colaborador' || item.role === 'cliente') {
            newSettings[item.role] = item.visible_tabs;
          }
        });
        setSettings(newSettings);
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

  return {
    settings,
    isLoading,
    isTabVisible,
    updateSettings,
    getVisibleTabsForRole,
    refetch: fetchSettings
  };
}
