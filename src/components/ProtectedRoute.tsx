import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppAccess } from '@/hooks/useAppAccess';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  appName?: string; // New: Check access to specific app
}

export function ProtectedRoute({ children, requireAdmin = false, appName }: ProtectedRouteProps) {
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const { hasAppAccess, isLoading: appAccessLoading } = useAppAccess();
  const location = useLocation();

  // Show loading spinner while checking auth state
  if (loading || rolesLoading || appAccessLoading) {
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
