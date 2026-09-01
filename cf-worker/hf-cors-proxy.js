/**
 * Cloudflare Worker — Proxy CORS pour Hugging Face Inference API
 * ===============================================================
 * DEPLOIEMENT (2 minutes) :
 *  1. Allez sur https://workers.cloudflare.com -> connectez-vous
 *  2. Cliquez "Create a Worker"
 *  3. Collez ce code entier dans l editeur
 *  4. Cliquez "Save and Deploy"
 *  5. Copiez l URL du Worker (ex: hf-proxy.votre-nom.workers.dev)
 *  6. Mettez cette URL dans src/config.js -> HF_PROXY_URL
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const hfUrl = 'https://api-inference.huggingface.co' + url.pathname + url.search;

    const headers = new Headers();
    const auth = request.headers.get('authorization');
    const ct   = request.headers.get('content-type');
    if (auth) headers.set('authorization', auth);
    if (ct)   headers.set('content-type', ct);

    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : request.body;
    const hfRes = await fetch(hfUrl, {
      method:  request.method,
      headers: headers,
      body:    body,
    });

    const resHeaders = new Headers(hfRes.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => resHeaders.set(k, v));

    return new Response(hfRes.body, {
      status:     hfRes.status,
      statusText: hfRes.statusText,
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
