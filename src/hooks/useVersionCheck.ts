import { useState, useEffect, useCallback } from 'react';

const VERSION_KEY = 'app_version_timestamp';
const AUTO_UPDATE_KEY = 'app_auto_updated';

export function useVersionCheck(autoUpdate: boolean = false) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(true);

  const detectHash = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`/?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (!response.ok) return null;
      const html = await response.text();
      // Vite adds content hash to built JS files
      const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
      return scriptMatch ? scriptMatch[1] : null;
    } catch {
      return null;
    }
  }, []);

  // Force any waiting service worker to activate immediately
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg?.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW installed while old one is active — activate it now
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      });

      // When the new SW takes over, reload to get fresh code
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const currentHash = await detectHash();
        const storedHash = localStorage.getItem(VERSION_KEY);

        if (currentHash && storedHash && currentHash !== storedHash) {
          const justUpdated = sessionStorage.getItem(AUTO_UPDATE_KEY);

          if (autoUpdate && !justUpdated) {
            sessionStorage.setItem(AUTO_UPDATE_KEY, 'true');
            localStorage.setItem(VERSION_KEY, currentHash);
            // Clear all caches before reload
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
            window.location.reload();
            return;
          }

          setHasUpdate(true);
        } else if (currentHash && !storedHash) {
          localStorage.setItem(VERSION_KEY, currentHash);
        }

        sessionStorage.removeItem(AUTO_UPDATE_KEY);
      } catch (error) {
        console.log('Version check skipped:', error);
      } finally {
        setChecking(false);
      }
    };

    checkVersion();

    // Also recheck when the tab regains focus (user comes back to the app)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [autoUpdate, detectHash]);

  const updateApp = async () => {
    localStorage.removeItem(VERSION_KEY);
    // Clear all service worker caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    // Unregister SW to force clean start
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.unregister();
    }
    window.location.reload();
  };

  const saveCurrentVersion = () => {
    detectHash().then(hash => {
      if (hash) localStorage.setItem(VERSION_KEY, hash);
    });
  };

  return { hasUpdate, checking, updateApp, saveCurrentVersion };
}
