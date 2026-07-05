import { DB_NAME, DB_VERSION } from './config.js';

export const db = {
  open: () => new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      ['chats','agents','settings','global_memory','workflows','agent_feedback','saved_quizzes'].forEach(s => {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath:'id' });
      });
    };
    req.onsuccess = e => { db.conn = e.target.result; res(db.conn); };
    req.onerror = e => rej(e.target.error);
  }),
  put: (store, data) => new Promise((res, rej) => {
    try {
      // Nettoyer les Proxies Vue (DataCloneError)
      const cleanData = JSON.parse(JSON.stringify(data));
      const tx = db.conn.transaction(store, 'readwrite');
      const r = tx.objectStore(store).put(cleanData);
      r.onsuccess = () => res(); r.onerror = e => rej(e.target.error);
    } catch(e) { rej(e); }
  }),
  get: (store, id) => new Promise((res, rej) => {
    try {
      const tx = db.conn.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(id);
      r.onsuccess = () => res(r.result); r.onerror = e => rej(e.target.error);
    } catch(e) { rej(e); }
  }),
  getAll: store => new Promise((res, rej) => {
    try {
      const tx = db.conn.transaction(store, 'readonly');
      const r = tx.objectStore(store).getAll();
      r.onsuccess = () => res(r.result); r.onerror = e => rej(e.target.error);
    } catch(e) { rej(e); }
  }),
  getChatsMetadata: () => new Promise((res, rej) => {
    try {
      const tx = db.conn.transaction('chats', 'readonly');
      const store = tx.objectStore('chats');
      const req = store.openCursor();
      const metas = [];
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
           const c = cursor.value;
           metas.push({
             id: c.id,
             title: c.title,
             updated: c.updated,
             fav: c.fav,
             msgCount: (c.messages||[]).filter(m=>m.role!=='system').length
           });
           cursor.continue();
        } else {
           res(metas);
        }
      };
      req.onerror = e => rej(e.target.error);
    } catch(e) { rej(e); }
  }),
  delete: (store, id) => new Promise((res, rej) => {
    try {
      const tx = db.conn.transaction(store, 'readwrite');
      const r = tx.objectStore(store).delete(id);
      r.onsuccess = () => res(); r.onerror = e => rej(e.target.error);
    } catch(e) { rej(e); }
  })
};
