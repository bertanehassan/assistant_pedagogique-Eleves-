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
  ({ url }) => url.pathname === '/' && url.searchParams.get('shared_file') === 'true',
  async ({ event }) => {
    try {
      const formData = await event.request.formData();
      const file = formData.get('shared_quiz_file');
      let text = null;

      if (file && typeof file.text === 'function') {
        text = await file.text();
      } else {
        const rawText = formData.get('text');
        if (rawText && rawText.includes('{')) {
          text = rawText; // WhatsApp a partagé le contenu texte
        } else {
        const rawTitle = formData.get('title');
        if (rawTitle && rawTitle.includes('{')) text = rawTitle;
        }
      }
      
      let debugLog = `file=${!!file}, text=${!!formData.get('text')}, title=${!!formData.get('title')}, url=${!!formData.get('url')}`;
      if (file) debugLog += `, fileName=${file.name}, fileSize=${file.size}`;

      // Sauvegarde dans IndexedDB (QCM_EDU_MAROC_DB)
      await new Promise((resolve, reject) => {
        // Version 2 d'après src/config.js
        const request = indexedDB.open('QCM_EDU_MAROC_DB', 2);
        
        request.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          
          if (text) {
            store.put({ id: 'shared_quiz_pending', value: text });
          }
          store.put({ id: 'shared_quiz_debug', value: debugLog });
          
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('[SW] Erreur de traitement du share_target:', err);
    }
    
    // Redirection en GET vers la page d'accueil avec un paramètre pour déclencher le chargement
    return Response.redirect('/?shared_file=true', 303);
  },
  'POST'
);

// 4. Gestion de la mise à jour du Service Worker (Bouton "Mettre à jour")
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
