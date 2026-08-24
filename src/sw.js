import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// 1. Mise en cache des assets statiques (Vite)
precacheAndRoute(self.__WB_MANIFEST);

// 2. Stratégies de cache runtime (CDN, Fonts)
registerRoute(
  ({ url }) => url.href.match(/^https:\/\/cdn\.jsdelivr\.net\/.*/i),
  new CacheFirst({
    cacheName: 'jsdelivr-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

registerRoute(
  ({ url }) => url.href.match(/^https:\/\/cdnjs\.cloudflare\.com\/.*/i),
  new CacheFirst({
    cacheName: 'cdnjs-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

registerRoute(
  ({ url }) => url.href.match(/^https:\/\/fonts\.googleapis\.com\/.*/i),
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-cache'
  })
);

registerRoute(
  ({ url }) => url.href.match(/^https:\/\/fonts\.gstatic\.com\/.*/i),
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 })
    ]
  })
);

// 3. Interception du Web Share Target (POST)
registerRoute(
  ({ url }) => url.searchParams.get('shared_file') === 'true',
  async ({ event }) => {
    let debugInfo = "sw_start|";
    try {
      debugInfo += "form_wait|";
      const formData = await event.request.formData();
      debugInfo += "form_ok|";
      
      const file = formData.get('shared_quiz_file');
      let text = null;

      if (file && typeof file.text === 'function') {
        debugInfo += `file(${file.name},${file.size})|`;
        text = await file.text();
      } else {
        const rawText = formData.get('text');
        if (rawText && rawText.includes('{')) {
          text = rawText;
          debugInfo += 'rawText_ok|';
        } else {
          const rawTitle = formData.get('title');
          if (rawTitle && rawTitle.includes('{')) {
            text = rawTitle;
            debugInfo += 'rawTitle_ok|';
          }
        }
      }
      
      if (!text) {
        debugInfo += `no_text(file=${!!file},text=${!!formData.get('text')},title=${!!formData.get('title')})|`;
      }

      if (text) {
        debugInfo += "db_wait|";
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('QCM_EDU_MAROC_DB', 2);
          request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            store.put({ id: 'shared_quiz_pending', value: text });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
          request.onerror = () => reject(request.error);
        });
        debugInfo += "db_ok|";
      }
    } catch (err) {
      console.error('[SW] Erreur de traitement du share_target:', err);
      debugInfo += "err=" + (err.message || 'unknown');
    }
    
    return Response.redirect(`/?shared_file=true&sw_debug=${encodeURIComponent(debugInfo)}`, 303);
  },
  'POST'
);

// 4. Gestion de la mise à jour du Service Worker (Bouton "Mettre à jour")
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
