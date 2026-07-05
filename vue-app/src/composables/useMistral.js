/**
 * useMistral - Logique centralisée d'appel à l'API Mistral AI
 */

/**
 * Exécute un fetch avec une logique de retry exponentiel
 * Gère les Rate Limits (429) et les erreurs serveur (5xx)
 */
export async function fetchWithRetry(url, options, maxRetries = 3, onToast = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (onToast) onToast("Connexion internet requise pour utiliser l'IA. Mode hors-ligne actif.", "error");
    throw new Error("Offline mode: cannot reach the network");
  }
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || attempt === maxRetries) return res;
      
      // Retry seulement sur 429 (rate limit) ou 5xx (erreur serveur)
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(3, attempt) * 1000; // 1s, 3s, 9s
        if (onToast) onToast(`Rate limit ou erreur serveur, retry dans ${delay/1000}s (${attempt+1}/${maxRetries})`, "info");
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res; // 4xx (sauf 429) => pas de retry
    } catch(e) {
      if (e.name === 'AbortError') throw e; // Ne pas retry un abort (annulation utilisateur)
      if (attempt === maxRetries) throw e;
      
      const delay = Math.pow(3, attempt) * 1000;
      if (onToast) onToast(`Erreur réseau, retry dans ${delay/1000}s (${attempt+1}/${maxRetries})`, "info");
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
