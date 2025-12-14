import { useState, useEffect } from 'react';

const BUILD_TIMESTAMP = Date.now().toString();
const VERSION_KEY = 'app_version_timestamp';

export function useVersionCheck() {
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
            setHasUpdate(true);
          } else if (currentHash && !storedHash) {
            // First visit, store the current hash
            localStorage.setItem(VERSION_KEY, currentHash);
          }
        }
      } catch (error) {
        console.log('Version check skipped:', error);
      } finally {
        setChecking(false);
      }
    };

    checkVersion();
  }, []);

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
