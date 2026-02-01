import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const INACTIVITY_LOGOUT_KEY = 'inactivity_logout';
const LAST_ACTIVITY_STORAGE_KEY = 'last_activity_timestamp';

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOutRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());

  // Store last activity in localStorage to persist across tab focus changes
  const updateLastActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    } catch (e) {
      // localStorage might be unavailable
    }
  }, []);

  const getLastActivity = useCallback((): number => {
    try {
      const stored = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      if (stored) {
        const timestamp = parseInt(stored, 10);
        if (!isNaN(timestamp)) {
          return timestamp;
        }
      }
    } catch (e) {
      // localStorage might be unavailable
    }
    return lastActivityRef.current;
  }, []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current || !user) return;
    
    // Double-check: if there was recent activity, don't logout
    const lastActivity = getLastActivity();
    const timeSinceLastActivity = Date.now() - lastActivity;
    
    if (timeSinceLastActivity < INACTIVITY_TIMEOUT_MS - 5000) {
      console.log('[useInactivityTimeout] Recent activity detected, skipping logout. Time since last activity:', Math.round(timeSinceLastActivity / 1000), 'seconds');
      return;
    }
    
    isLoggingOutRef.current = true;
    console.log('[useInactivityTimeout] Session expired due to inactivity after', Math.round(timeSinceLastActivity / 1000), 'seconds');
    
    // Mark that we logged out due to inactivity
    sessionStorage.setItem(INACTIVITY_LOGOUT_KEY, 'true');
    
    // Clean up last activity storage
    try {
      localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    } catch (e) {
      // Ignore
    }
    
    toast.info('Sesión cerrada por inactividad', {
      description: 'Por seguridad, la sesión se ha cerrado tras 10 minutos de inactividad.',
      duration: 5000,
    });
    
    await signOut();
    navigate('/auth', { replace: true });
    isLoggingOutRef.current = false;
  }, [user, signOut, navigate, getLastActivity]);

  const resetTimeout = useCallback(() => {
    if (!user) return;
    
    // Update last activity timestamp
    updateLastActivity();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, handleLogout, updateLastActivity]);

  // Create a stable reference for the reset function that doesn't change
  const resetTimeoutRef = useRef(resetTimeout);
  resetTimeoutRef.current = resetTimeout;

  // Stable event handler that uses ref
  const stableResetHandler = useCallback(() => {
    resetTimeoutRef.current();
  }, []);

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
      'pointerdown',
      'pointermove',
      'pointerup',
    ];

    // Window-level events
    const windowEvents = [
      'focus',
      'blur',
      'resize',
      'scroll',
    ];

    // Initial timeout
    resetTimeoutRef.current();

    // Add document event listeners using capture phase to catch all events
    documentEvents.forEach(event => {
      document.addEventListener(event, stableResetHandler, { capture: true, passive: true });
    });

    // Add window event listeners
    windowEvents.forEach(event => {
      window.addEventListener(event, stableResetHandler, { passive: true });
    });

    // Handle visibility changes - check if timeout should have expired while tab was hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // When tab becomes visible, check if we've been inactive too long
        const lastActivity = getLastActivity();
        const timeSinceLastActivity = Date.now() - lastActivity;
        
        if (timeSinceLastActivity >= INACTIVITY_TIMEOUT_MS) {
          console.log('[useInactivityTimeout] Tab became visible after long inactivity, logging out');
          handleLogout();
        } else {
          // Resume timer with remaining time
          const remainingTime = INACTIVITY_TIMEOUT_MS - timeSinceLastActivity;
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            handleLogout();
          }, remainingTime);
          console.log('[useInactivityTimeout] Tab visible, resuming timer with', Math.round(remainingTime / 1000), 'seconds remaining');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also check periodically in case setTimeout drifts or gets throttled
    const checkInterval = setInterval(() => {
      const lastActivity = getLastActivity();
      const timeSinceLastActivity = Date.now() - lastActivity;
      
      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT_MS) {
        handleLogout();
      }
    }, 60000); // Check every minute

    return () => {
      // Cleanup
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      clearInterval(checkInterval);
      documentEvents.forEach(event => {
        document.removeEventListener(event, stableResetHandler, { capture: true });
      });
      windowEvents.forEach(event => {
        window.removeEventListener(event, stableResetHandler);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, stableResetHandler, handleLogout, getLastActivity]);

  return null;
}
