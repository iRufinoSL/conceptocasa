import { useState, useEffect, useCallback, useRef } from 'react';

const VERSION_KEY = 'app_version_hash';
const POLL_INTERVAL = 60_000; // check every 60s

export function useVersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const currentHashRef = useRef<string | null>(null);

  const detectHash = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`/?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (!response.ok) return null;
      const html = await response.text();
      const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
      return scriptMatch ? scriptMatch[1] : null;
    } catch {
      return null;
    }
  }, []);

  // Force any waiting service worker to activate
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg?.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      });
    }
  }, []);

  useEffect(() => {
    const checkVersion = async () => {
      const remoteHash = await detectHash();
      if (!remoteHash) return;

      // First run — store baseline
      if (!currentHashRef.current) {
        const stored = localStorage.getItem(VERSION_KEY);
        currentHashRef.current = stored || remoteHash;
        if (!stored) localStorage.setItem(VERSION_KEY, remoteHash);
      }

      if (remoteHash !== currentHashRef.current) {
        setHasUpdate(true);
      }
    };

    checkVersion();

    // Poll periodically
    const interval = setInterval(checkVersion, POLL_INTERVAL);

    // Also check on tab focus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [detectHash]);

  const updateApp = useCallback(async () => {
    // Save new hash so after reload we don't re-trigger
    const remoteHash = await detectHash();
    if (remoteHash) localStorage.setItem(VERSION_KEY, remoteHash);

    // Clear caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.unregister();
    }
    window.location.reload();
  }, [detectHash]);

  return { hasUpdate, updateApp };
}
