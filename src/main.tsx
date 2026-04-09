import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setWaitingRegistration } from './lib/appUpdate';

// Lazy-load migration script — only needed when called from console
if (typeof window !== 'undefined') {
  (window as any).__loadMigration = () => import('./scripts/migrateToSupabase');
}

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
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingRegistration(registration);
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
