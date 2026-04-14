import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setWaitingRegistration } from './lib/appUpdate';

const BUILD_VERSION = '2026-04-14-hard-refresh-1';
const BUILD_VERSION_STORAGE_KEY = 'astreda_build_version';

// Lazy-load migration script â€” only needed when called from console
if (typeof window !== 'undefined') {
  (window as any).__loadMigration = () => import('./scripts/migrateToSupabase');
}

async function enforceLatestBuild(): Promise<void> {
  if (typeof window === 'undefined') return;

  const previousVersion = localStorage.getItem(BUILD_VERSION_STORAGE_KEY);
  if (previousVersion === BUILD_VERSION) return;

  localStorage.setItem(BUILD_VERSION_STORAGE_KEY, BUILD_VERSION);

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }

  if (previousVersion) {
    window.location.reload();
  }
}

(async () => {
  await enforceLatestBuild();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App/>
    </StrictMode>,
  );

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      let refreshing = false;

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      navigator.serviceWorker.register('/sw.js').then((registration) => {
        if (registration.waiting) {
          setWaitingRegistration(registration);
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              setWaitingRegistration(registration);
              registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        const checkForUpdates = () => {
          registration.update().catch(() => {
            // Ignore transient update-check failures.
          });
        };

        window.setInterval(checkForUpdates, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdates();
        });
        window.addEventListener('focus', checkForUpdates);
      }).catch(() => {
        // Ignore service worker registration failures.
      });
    });
  }
})();
