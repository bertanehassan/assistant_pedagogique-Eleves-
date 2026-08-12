/**
 * Vercel Serverless Function — Proxy xAI (Grok)
 * Route : /api/xai-proxy  →  https://api.x.ai/v1/*
 *
 * Contourne les restrictions CORS des navigateurs.
 * La clé API voyage dans l'en-tête Authorization, jamais exposée côté client.
 */
export const config = { runtime: 'edge' };

export default async function handler(req) {
  // ── Préflight CORS (OPTIONS) ──
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  // ── Reconstituer le chemin xAI ──
  const url = new URL(req.url);
  // Strip le préfixe /api/xai-proxy pour obtenir /v1/chat/completions etc.
  const xaiPath = url.pathname.replace(/^\/api\/xai-proxy/, '') || '/v1/chat/completions';
  const xaiUrl = `https://api.x.ai${xaiPath}${url.search}`;

  // ── Transférer la requête vers xAI ──
  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined;

  const headers = new Headers();
  // Transférer uniquement les en-têtes nécessaires
  const authorization = req.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const xaiRes = await fetch(xaiUrl, {
    method: req.method,
    headers,
    body,
  });

  // ── Retourner la réponse avec les en-têtes CORS ──
  const resHeaders = new Headers(xaiRes.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => resHeaders.set(k, v));

  return new Response(xaiRes.body, {
    status: xaiRes.status,
    statusText: xaiRes.statusText,
    headers: resHeaders,
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
