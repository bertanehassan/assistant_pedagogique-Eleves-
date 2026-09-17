/**
 * useMistral - Logique centralisée d'appel à l'API Mistral AI
 */

/**
 * Extrait le délai d'attente (en ms) depuis une réponse d'erreur Gemini.
 * Cherche dans : details[].retryDelay (JSON structuré) ET dans le message texte (regex fallback).
 * @param {Response} res - La réponse HTTP clonée
 * @returns {Promise<{waitMs: number|null, isQuota: boolean, msg: string}>}
 */
async function parseGeminiRetryDelay(res) {
  let waitMs = null;
  let isQuota = false;
  let msg = '';
  try {
    const body = await res.clone().json();
    msg = body?.error?.message || '';
    isQuota = msg.includes('free_tier') || msg.includes('quota') || msg.includes('Quota');

    // 1) Cherche dans error.details[].retryDelay (structure officielle gRPC)
    const details = body?.error?.details || [];
    for (const d of details) {
      // Format string : "0.972s" ou "50.136s"
      if (typeof d.retryDelay === 'string') {
        const s = parseFloat(d.retryDelay.replace('s', ''));
        if (!isNaN(s)) { waitMs = Math.ceil(s * 1000) + 300; break; }
      }
      // Format objet : { seconds: "50", nanos: 136892611 }
      if (d.retryDelay?.seconds !== undefined) {
        const s = parseInt(d.retryDelay.seconds, 10) || 0;
        const ns = parseInt(d.retryDelay.nanos, 10) || 0;
        waitMs = Math.ceil(s * 1000 + ns / 1e6) + 300; break;
      }
      // RetryInfo @type
      if (d['@type']?.includes('RetryInfo')) {
        if (typeof d.retryDelay === 'string') {
          const s = parseFloat(d.retryDelay.replace('s', ''));
          if (!isNaN(s)) { waitMs = Math.ceil(s * 1000) + 300; break; }
        }
      }
    }

    // 2) Fallback regex sur le message texte : "Please retry in 50.136892611s."
    if (!waitMs && msg) {
      const m = msg.match(/retry in\s+([\d.]+)\s*s/i);
      if (m) {
        const s = parseFloat(m[1]);
        if (!isNaN(s)) waitMs = Math.ceil(s * 1000) + 300;
      }
    }
  } catch (_) {}
  return { waitMs, isQuota, msg };
}

/**
 * Affiche un compte à rebours dans un toast pendant l'attente de quota.
 */
async function waitWithCountdown(waitMs, onToast, attempt, maxRetries, isQuota) {
  const totalSec = Math.ceil(waitMs / 1000);
  const label = isQuota
    ? `⏳ Quota Gemini atteint (${attempt}/${maxRetries}) — réessai automatique dans`
    : `🔄 Erreur serveur (${attempt}/${maxRetries}) — réessai dans`;

  // Toast initial
  if (onToast) onToast(`${label} ${totalSec}s…`, 'info');

  // Compte à rebours toutes les 5s pour les longues attentes
  const interval = totalSec > 10 ? 5000 : 2000;
  let elapsed = 0;
  while (elapsed < waitMs - interval) {
    await new Promise(r => setTimeout(r, interval));
    elapsed += interval;
    const remaining = Math.ceil((waitMs - elapsed) / 1000);
    if (remaining > 0 && onToast) {
      onToast(`${label} ${remaining}s…`, 'info');
    }
  }
  // Attendre le reste
  const remaining = waitMs - elapsed;
  if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
}

/**
 * Exécute un fetch avec retry intelligent.
 * - Lit le retryDelay exact fourni par Gemini (JSON + regex message)
 * - Affiche un compte à rebours pendant les longues attentes
 * - 1 seul retry pour les quotas longs (>15s), 3 retries pour les erreurs courtes
 */
export async function fetchWithRetry(url, options, maxRetries = 3, onToast = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (onToast) onToast("Connexion internet requise pour utiliser l'IA. Mode hors-ligne actif.", 'error');
    throw new Error('Offline mode: cannot reach the network');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || attempt === maxRetries) return res;

      // Retry uniquement sur 429 ou 5xx
      if (res.status === 429 || res.status >= 500) {
        const { waitMs: apiWait, isQuota, msg } = await parseGeminiRetryDelay(res);

        let waitMs = apiWait ?? Math.pow(3, attempt) * 1000; // fallback exponentiel

        // Pour les longs délais de quota (>15s) : 1 seul retry suffit
        const effectiveMaxRetries = (isQuota && waitMs > 15000) ? 1 : maxRetries;
        if (attempt >= effectiveMaxRetries) {
          // Épuisé : renvoyer la réponse pour que l'appelant affiche l'erreur finale
          return res;
        }

        await waitWithCountdown(waitMs, onToast, attempt + 1, effectiveMaxRetries, isQuota);
        continue;
      }

      return res; // 4xx (sauf 429) → pas de retry
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (attempt === maxRetries) throw e;
      const delay = Math.pow(3, attempt) * 1000;
      if (onToast) onToast(`Erreur réseau, retry dans ${delay / 1000}s (${attempt + 1}/${maxRetries})`, 'info');
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
