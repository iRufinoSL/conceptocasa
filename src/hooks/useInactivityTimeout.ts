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
  const lastActivityRef = useRef<number>(Date.now());

  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current || !user) return;
    
    // Double-check: if there was recent activity, don't logout
    const timeSinceLastActivity = Date.now() - lastActivityRef.current;
    if (timeSinceLastActivity < INACTIVITY_TIMEOUT_MS - 1000) {
      console.log('[useInactivityTimeout] Recent activity detected, skipping logout');
      return;
    }
    
    isLoggingOutRef.current = true;
    console.log('[useInactivityTimeout] Session expired due to inactivity');
    
    // Mark that we logged out due to inactivity
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
    
    // Update last activity timestamp
    lastActivityRef.current = Date.now();
    
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

    // Check if we're logging in after an inactivity logout
    const wasInactivityLogout = sessionStorage.getItem(INACTIVITY_LOGOUT_KEY);
    if (wasInactivityLogout === 'true') {
      console.log('[useInactivityTimeout] Detected login after inactivity logout, forcing full reload');
      sessionStorage.removeItem(INACTIVITY_LOGOUT_KEY);
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return;
    }

    // Events that reset the inactivity timer - comprehensive list
    const documentEvents = [
      'mousedown',
      'mousemove',
      'mouseup',
      'keydown',
      'keyup',
      'keypress',
      'scroll',
      'touchstart',
      'touchmove',
      'touchend',
      'click',
      'dblclick',
      'wheel',
      'input',
      'change',
      'focus',
      'blur',
      'submit',
      'reset',
      'select',
      'contextmenu',
      'drag',
      'dragstart',
      'dragend',
      'drop',
    ];

    // Window-level events
    const windowEvents = [
      'focus',
      'blur',
      'resize',
      'scroll',
    ];

    // Initial timeout
    resetTimeout();

    // Add document event listeners using capture phase to catch all events
    documentEvents.forEach(event => {
      document.addEventListener(event, resetTimeout, { capture: true, passive: true });
    });

    // Add window event listeners
    windowEvents.forEach(event => {
      window.addEventListener(event, resetTimeout, { passive: true });
    });

    // Also listen for visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetTimeout();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // Cleanup
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      documentEvents.forEach(event => {
        document.removeEventListener(event, resetTimeout, { capture: true });
      });
      windowEvents.forEach(event => {
        window.removeEventListener(event, resetTimeout);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, resetTimeout]);

  return null;
}
