import { useState, useEffect, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppAccess } from '@/hooks/useAppAccess';
import { supabase } from '@/integrations/supabase/client';
import { PasswordChangeRequired } from './PasswordChangeRequired';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  appName?: string;
}

export function ProtectedRoute({ children, requireAdmin = false, appName }: ProtectedRouteProps) {
  const { user, loading, rolesLoading, isAdmin, isCliente, userPresupuestos } = useAuth();
  const { hasAppAccess, isLoading: appAccessLoading } = useAppAccess();
  const location = useLocation();
  
  const [passwordChangeRequired, setPasswordChangeRequired] = useState<boolean | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);

  // Check if user needs to change password and save current route
  const checkProfile = useCallback(async () => {
    if (!user) {
      setCheckingProfile(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('password_change_required, last_route')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[ProtectedRoute] Error checking profile:', error);
        setPasswordChangeRequired(false);
      } else {
        setPasswordChangeRequired(data?.password_change_required || false);
      }
    } catch (error) {
      console.error('[ProtectedRoute] Error:', error);
      setPasswordChangeRequired(false);
    } finally {
      setCheckingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !rolesLoading && user) {
      checkProfile();
    } else if (!loading && !rolesLoading && !user) {
      setCheckingProfile(false);
    }
  }, [loading, rolesLoading, user, checkProfile]);

  // Save current route for later restoration (debounced)
  useEffect(() => {
    if (!user || loading || rolesLoading || passwordChangeRequired) return;
    
    const excludedRoutes = ['/auth', '/setup', '/install', '/'];
    if (excludedRoutes.includes(location.pathname)) return;

    const currentPath = location.pathname + location.search;
    
    const timeout = setTimeout(async () => {
      try {
        await supabase
          .from('profiles')
          .update({ last_route: currentPath })
          .eq('id', user.id);
      } catch (error) {
        // Silent fail - non-critical
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [user, loading, rolesLoading, location.pathname, location.search, passwordChangeRequired]);

  // Show loading spinner while checking auth state
  if (loading || rolesLoading || appAccessLoading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!user) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check if password change is required
  if (passwordChangeRequired) {
    return (
      <PasswordChangeRequired 
        onPasswordChanged={() => setPasswordChangeRequired(false)} 
      />
    );
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check app-specific access (for non-admins)
  if (appName && !isAdmin() && !hasAppAccess(appName)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
