import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // Warn 2 min before logout
const THROTTLE_MS = 5000; // Only update activity every 5s to reduce overhead
export const INACTIVITY_LOGOUT_KEY = 'inactivity_logout';
const LAST_ACTIVITY_STORAGE_KEY = 'last_activity_timestamp';

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOutRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottledUpdateRef = useRef<number>(0);
  const warningShownRef = useRef(false);

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
        if (!isNaN(timestamp)) return timestamp;
      }
    } catch (e) {}
    return lastActivityRef.current;
  }, []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current || !user) return;

    const lastActivity = getLastActivity();
    const timeSinceLastActivity = Date.now() - lastActivity;

    if (timeSinceLastActivity < INACTIVITY_TIMEOUT_MS - 5000) {
      return;
    }

    isLoggingOutRef.current = true;
    sessionStorage.setItem(INACTIVITY_LOGOUT_KEY, 'true');
    try { localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY); } catch (e) {}

    toast.info('Sesión cerrada por inactividad', {
      description: 'Por seguridad, la sesión se ha cerrado tras 15 minutos de inactividad.',
      duration: 5000,
    });

    await signOut();
    navigate('/auth', { replace: true });
    isLoggingOutRef.current = false;
  }, [user, signOut, navigate, getLastActivity]);

  const showWarning = useCallback(() => {
    if (warningShownRef.current) return;
    warningShownRef.current = true;
    toast.warning('Tu sesión se cerrará pronto', {
      description: 'Haz clic o escribe algo para mantener la sesión activa. Se cerrará en 2 minutos.',
      duration: 15000,
    });
  }, []);

  const resetTimeout = useCallback(() => {
    if (!user) return;

    // Throttle: skip rapid resets but always update in-memory ref
    const now = Date.now();
    lastActivityRef.current = now;

    if (now - lastThrottledUpdateRef.current < THROTTLE_MS) return;
    lastThrottledUpdateRef.current = now;

    updateLastActivity();
    warningShownRef.current = false;

    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Warning before logout
    warningTimeoutRef.current = setTimeout(() => {
      showWarning();
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, handleLogout, updateLastActivity, showWarning]);

  const resetTimeoutRef = useRef(resetTimeout);
  resetTimeoutRef.current = resetTimeout;

  const stableResetHandler = useCallback(() => {
    resetTimeoutRef.current();
  }, []);

  useEffect(() => {
    if (!user) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (warningTimeoutRef.current) { clearTimeout(warningTimeoutRef.current); warningTimeoutRef.current = null; }
      return;
    }

    const wasInactivityLogout = sessionStorage.getItem(INACTIVITY_LOGOUT_KEY);
    if (wasInactivityLogout === 'true') {
      sessionStorage.removeItem(INACTIVITY_LOGOUT_KEY);
      setTimeout(() => { window.location.reload(); }, 100);
      return;
    }

    const documentEvents = [
      'mousedown', 'mousemove', 'mouseup',
      'keydown', 'keyup', 'keypress',
      'scroll', 'touchstart', 'touchmove', 'touchend',
      'click', 'dblclick', 'wheel',
      'input', 'change', 'focus', 'blur',
      'submit', 'reset', 'select',
      'contextmenu', 'drag', 'dragstart', 'dragend', 'drop',
      'pointerdown', 'pointermove', 'pointerup',
    ];

    const windowEvents = ['focus', 'blur', 'resize', 'scroll'];

    // Force initial activity update (bypass throttle)
    lastThrottledUpdateRef.current = 0;
    resetTimeoutRef.current();

    documentEvents.forEach(event => {
      document.addEventListener(event, stableResetHandler, { capture: true, passive: true });
    });
    windowEvents.forEach(event => {
      window.addEventListener(event, stableResetHandler, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const lastActivity = getLastActivity();
        const timeSinceLastActivity = Date.now() - lastActivity;

        if (timeSinceLastActivity >= INACTIVITY_TIMEOUT_MS) {
          handleLogout();
        } else {
          const remainingTime = INACTIVITY_TIMEOUT_MS - timeSinceLastActivity;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);

          const warningRemaining = remainingTime - WARNING_BEFORE_MS;
          if (warningRemaining > 0) {
            warningTimeoutRef.current = setTimeout(showWarning, warningRemaining);
          }
          timeoutRef.current = setTimeout(handleLogout, remainingTime);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const checkInterval = setInterval(() => {
      const lastActivity = getLastActivity();
      const timeSinceLastActivity = Date.now() - lastActivity;
      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT_MS) {
        handleLogout();
      }
    }, 60000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      clearInterval(checkInterval);
      documentEvents.forEach(event => {
        document.removeEventListener(event, stableResetHandler, { capture: true });
      });
      windowEvents.forEach(event => {
        window.removeEventListener(event, stableResetHandler);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, stableResetHandler, handleLogout, getLastActivity, showWarning]);

  return null;
}
