export const MODELS = [

  // ══════════════════════════════════════════════════
  // ✨ GOOGLE GEMINI  (api.generativelanguage.googleapis.com)
  // ══════════════════════════════════════════════════
  { id:"gemini-3.8-flash",                              name:"🚀 Gemini 3.8 Flash (Dernière Génération)", badge:"🚀 Rapide",      desc:"Dernière génération Gemini Flash — ultra réactif, vision & PDF natifs", tokens:1048576, ctx:"1M",  temp:0.4, vision:true, pdfNative:true },
  { id:"gemini-3.7-flash",                              name:"✨ Gemini 3.7 Flash — Raisonnement & Vision",badge:"✨ Recommandé", desc:"Multimodal, pensée hybride, idéal pour fiches méthodes et didactiques", tokens:1000000, ctx:"1M",  temp:0.4, vision:true, pdfNative:true },
  { id:"gemini-3.1-pro",                                name:"🧠 Gemini 3.1 Pro — Expert Raisonnement",   badge:"🧠 Expert",      desc:"Raisonnement très poussé, correction d'épreuves complexes (contexte 2M)", tokens:2000000, ctx:"2M",  temp:0.4, vision:true, pdfNative:true },

  // ══════════════════════════════════════════════════
  // 🔥 MISTRAL AI  (api.mistral.ai)
  // ══════════════════════════════════════════════════
  { id:"mistral-large-2512",                            name:"🔥 Mistral Large 3 — Puissant",             badge:"🔥 Flagship",    desc:"41B actifs / 675B total, multimodal (vision), excellent en français",    tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"mistral-small-2603",                            name:"⚡ Mistral Small 4 — Hybride",              badge:"⚡ Équilibré",   desc:"Instruct + vision unifiés, ultra rapide et pertinent",                  tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"ministral-8b-2512",                             name:"⚡ MicroGenius 8B — Usage Quotidien",       badge:"⚡ Rapide",      desc:"Compact, très rapide, texte + vision, idéal téléphones/tablettes",       tokens:256000, ctx:"256K", temp:0.42, vision:true },

  // ══════════════════════════════════════════════════
  // 🆓 MODÈLES MULTIMODAUX & OMNI GRATUITS (OpenRouter actifs)
  // ══════════════════════════════════════════════════
  { id:"openrouter/free",                               name:"🔀 Auto-Router Multimodal (Gratuit)",       badge:"🆓 Auto",       desc:"Routeur officiel OpenRouter : bascule automatique sur les modèles gratuits actifs avec vision", tokens:200000, ctx:"200K", temp:0.5, vision:true },
  { id:"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name:"⚡ Nemotron 3 Nano Omni (Gratuit)",    badge:"🆓 Omni",       desc:"NVIDIA Omni natif (texte, vision, audio), raisonnement poussé, 100% gratuit", tokens:256000, ctx:"256K", temp:0.5, vision:true, audio:true },
  { id:"google/gemma-4-26b-a4b-it:free",               name:"🔷 Gemma 4 26B — Vision & Raisonnement (Gratuit)", badge:"🆓 Vision", desc:"Dernière génération Gemma 4 Google, multimodalité native et haute précision", tokens:262144, ctx:"262K", temp:0.5, vision:true },
  { id:"google/gemma-4-31b-it:free",                   name:"🔷 Gemma 4 31B — Grand Format (Gratuit)",   badge:"🆓 Vision",     desc:"Version 31B Google Gemma 4, excellent pour rédactions et sciences", tokens:262144, ctx:"262K", temp:0.5, vision:true },
  { id:"thinkingmachines/inkling:free",                 name:"✨ Inkling 1M — Contexte Géant (Gratuit)",  badge:"🆓 1M Ctx",     desc:"Modèle multimodal ThinkMachines avec 1 million de tokens de contexte, gratuit", tokens:1048576, ctx:"1M", temp:0.5, vision:true, audio:true },
  { id:"nvidia/nemotron-3-super-120b-a12b:free",        name:"⚡ Nemotron 3 Super 120B (Gratuit)",        badge:"🆓 Raisonnement", desc:"NVIDIA 120B puissant pour analyse approfondie et synthèses", tokens:128000, ctx:"128K", temp:0.5 },

  // ══════════════════════════════════════════════════
  // 🧠 DEEPSEEK  (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"deepseek/deepseek-chat",                        name:"🧠 DeepSeek Chat v3",                       badge:"🧠 Intelligent", desc:"Modèle avancé DeepSeek conversationnel et mathématiques",             tokens:64000,  ctx:"64K",  temp:0.5 },
  { id:"deepseek/deepseek-r1",                          name:"🧠 DeepSeek R1 — Raisonnement Avancé",      badge:"🧠 Raisonnement",desc:"Raisonnement chain-of-thought pour problèmes complexes",                tokens:64000,  ctx:"64K",  temp:0.5 }

];

export const DB_NAME = "QCM_EDU_MAROC_DB";
export const DB_VERSION = 3;

// ══════════════════════════════════════════════════════════════════════
// 🤖 xAI PROXY URL (Cloudflare Worker)
// ══════════════════════════════════════════════════════════════════════
export const XAI_PROXY_URL = "https://xai-proxy.bh-gravity8.workers.dev";

// ══════════════════════════════════════════════════════════════════════
// 🤗 HUGGING FACE PROXY URL (Cloudflare Worker)
// ══════════════════════════════════════════════════════════════════════
export const HF_PROXY_URL = "";
