/**
 * Cloudflare Worker — Proxy CORS pour xAI (Grok)
 * ================================================
 * DÉPLOIEMENT (2 minutes) :
 *  1. Allez sur https://workers.cloudflare.com → créez un compte gratuit
 *  2. Cliquez "Create a Worker"
 *  3. Collez ce code entier dans l'éditeur
 *  4. Cliquez "Save and Deploy"
 *  5. Copiez l'URL du Worker (ex: xai-proxy.votre-nom.workers.dev)
 *  6. Mettez cette URL dans src/config.js → XAI_PROXY_URL
 *
 * Limites plan gratuit Cloudflare Workers :
 *  - 100 000 requêtes / jour  (≈ 5 000 élèves × 20 messages)
 *  - Aucune limite de bande passante
 *  - Latence ultra-faible (edge mondial)
 */

export default {
  async fetch(request, env, ctx) {
    // ── Autoriser les requêtes CORS préliminaires (OPTIONS) ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── Reconstruire l'URL xAI ──
    const url = new URL(request.url);
    const xaiUrl = 'https://api.x.ai' + url.pathname + url.search;

    // ── Transférer les en-têtes nécessaires ──
    const headers = new Headers();
    const auth = request.headers.get('authorization');
    const ct   = request.headers.get('content-type');
    if (auth) headers.set('authorization', auth);
    if (ct)   headers.set('content-type', ct);

    // ── Appel vers xAI ──
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : request.body;
    const xaiRes = await fetch(xaiUrl, {
      method:  request.method,
      headers: headers,
      body:    body,
    });

    // ── Retourner la réponse avec les en-têtes CORS ──
    const resHeaders = new Headers(xaiRes.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => resHeaders.set(k, v));

    return new Response(xaiRes.body, {
      status:     xaiRes.status,
      statusText: xaiRes.statusText,
      headers:    resHeaders,
    });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
