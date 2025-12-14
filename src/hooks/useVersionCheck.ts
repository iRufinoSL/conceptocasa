import { useState, useEffect } from 'react';

const VERSION_KEY = 'app_version_timestamp';
const AUTO_UPDATE_KEY = 'app_auto_updated';

export function useVersionCheck(autoUpdate: boolean = false) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Fetch a cache-busted version of index.html to detect changes
        const response = await fetch(`/?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
          const html = await response.text();
          // Extract script src with hash (Vite adds hash to built files)
          const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
          const currentHash = scriptMatch ? scriptMatch[1] : null;
          
          const storedHash = localStorage.getItem(VERSION_KEY);
          
          if (currentHash && storedHash && currentHash !== storedHash) {
            // Check if we just auto-updated to prevent infinite loop
            const justUpdated = sessionStorage.getItem(AUTO_UPDATE_KEY);
            
            if (autoUpdate && !justUpdated) {
              // Mark that we're auto-updating
              sessionStorage.setItem(AUTO_UPDATE_KEY, 'true');
              localStorage.setItem(VERSION_KEY, currentHash);
              // Force reload
              window.location.reload();
              return;
            }
            
            setHasUpdate(true);
          } else if (currentHash && !storedHash) {
            // First visit, store the current hash
            localStorage.setItem(VERSION_KEY, currentHash);
          }
          
          // Clear the auto-update flag after successful load
          sessionStorage.removeItem(AUTO_UPDATE_KEY);
        }
      } catch (error) {
        console.log('Version check skipped:', error);
      } finally {
        setChecking(false);
      }
    };

    checkVersion();
  }, [autoUpdate]);

  const updateApp = () => {
    // Clear the stored version so next load saves the new one
    localStorage.removeItem(VERSION_KEY);
    // Force a hard reload bypassing cache
    window.location.reload();
  };

  const saveCurrentVersion = () => {
    // Save current version hash after successful login
    fetch(`/?_=${Date.now()}`, { cache: 'no-store' })
      .then(res => res.text())
      .then(html => {
        const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
        if (scriptMatch) {
          localStorage.setItem(VERSION_KEY, scriptMatch[1]);
        }
      })
      .catch(() => {});
  };

  return { hasUpdate, checking, updateApp, saveCurrentVersion };
}
