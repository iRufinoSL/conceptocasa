import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const INACTIVITY_LOGOUT_KEY = 'inactivity_logout';

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOutRef = useRef(false);

  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current || !user) return;
    
    isLoggingOutRef.current = true;
    console.log('[useInactivityTimeout] Session expired due to inactivity');
    
    // Mark that we logged out due to inactivity - this will trigger a full reload on next login
    sessionStorage.setItem(INACTIVITY_LOGOUT_KEY, 'true');
    
    toast.info('Sesión cerrada por inactividad', {
      description: 'Por seguridad, la sesión se ha cerrado tras 10 minutos de inactividad.',
      duration: 5000,
    });
    
    await signOut();
    navigate('/auth', { replace: true });
    isLoggingOutRef.current = false;
  }, [user, signOut, navigate]);

  const resetTimeout = useCallback(() => {
    if (!user) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, handleLogout]);

  useEffect(() => {
    if (!user) {
      // Clear timeout if user logs out
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Check if we're logging in after an inactivity logout - if so, force a full page reload
    const wasInactivityLogout = sessionStorage.getItem(INACTIVITY_LOGOUT_KEY);
    if (wasInactivityLogout === 'true') {
      console.log('[useInactivityTimeout] Detected login after inactivity logout, forcing full reload');
      sessionStorage.removeItem(INACTIVITY_LOGOUT_KEY);
      // Use a small delay to ensure the auth state is fully settled before reload
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return;
    }

    // Events that reset the inactivity timer
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel',
    ];

    // Initial timeout
    resetTimeout();

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, resetTimeout, { passive: true });
    });

    return () => {
      // Cleanup
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      activityEvents.forEach(event => {
        document.removeEventListener(event, resetTimeout);
      });
    };
  }, [user, resetTimeout]);

  return null;
}
