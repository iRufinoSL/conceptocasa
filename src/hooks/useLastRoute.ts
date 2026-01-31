import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Routes to exclude from saving (auth, setup, etc.)
const EXCLUDED_ROUTES = ['/auth', '/setup', '/install', '/'];

export function useLastRoute() {
  const location = useLocation();
  const { user } = useAuth();

  // Save the current route to the database
  const saveCurrentRoute = useCallback(async () => {
    if (!user) return;
    
    const currentPath = location.pathname + location.search;
    
    // Don't save excluded routes
    if (EXCLUDED_ROUTES.some(route => location.pathname === route)) {
      return;
    }

    try {
      await supabase
        .from('profiles')
        .update({ last_route: currentPath })
        .eq('id', user.id);
    } catch (error) {
      console.error('[useLastRoute] Error saving route:', error);
    }
  }, [user, location.pathname, location.search]);

  // Save route on location change
  useEffect(() => {
    // Debounce to avoid too many DB writes
    const timeout = setTimeout(saveCurrentRoute, 1000);
    return () => clearTimeout(timeout);
  }, [saveCurrentRoute]);

  // Get the last saved route from the database
  const getLastRoute = useCallback(async (): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('last_route')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[useLastRoute] Error fetching last route:', error);
        return null;
      }

      return data?.last_route || null;
    } catch (error) {
      console.error('[useLastRoute] Error:', error);
      return null;
    }
  }, [user]);

  return { getLastRoute, saveCurrentRoute };
}
