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
  // 🆓 MODÈLES MULTIMODAUX & OMNI GRATUITS (OpenRouter :free)
  // ══════════════════════════════════════════════════
  { id:"qwen/qwen-2.5-vl-72b-instruct:free",            name:"🌐 Qwen 2.5 VL 72B — Vision & Copies (Gratuit)", badge:"🆓 Vision", desc:"Leader open-source vision : OCR manuscrit, schémas, géométrie, 100% gratuit", tokens:32000, ctx:"32K", temp:0.4, vision:true },
  { id:"meta-llama/llama-4-maverick:free",              name:"🦙 Llama 4 Maverick — Vision 1M (Gratuit)",  badge:"🆓 Vision",     desc:"Meta Llama 4, vision + texte, contexte géant 1M, 100% gratuit",          tokens:1000000, ctx:"1M", temp:0.5, vision:true },
  { id:"mistralai/pixtral-12b:free",                    name:"🔥 Pixtral 12B — Vision Mistral (Gratuit)", badge:"🆓 Vision",     desc:"Modèle multimodal Mistral, excellent en français et documents, gratuit", tokens:128000, ctx:"128K", temp:0.42, vision:true },
  { id:"openrouter/free",                               name:"🔀 Auto-Router Multimodal (Gratuit)",       badge:"🆓 Auto",       desc:"Bascule intelligente vers le meilleur modèle gratuit disponible avec vision", tokens:128000, ctx:"128K", temp:0.5, vision:true },

  // ══════════════════════════════════════════════════
  // 📚 MODÈLES ENSEIGNEMENT & RAISONNEMENT GRATUITS (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"qwen/qwen3-235b-a22b:free",                     name:"🌐 Qwen 3 235B — Expert Arabe & Maths (Gratuit)", badge:"🆓 Arabe/Maths", desc:"Très grand modèle multilingue, exceptionnel pour l'arabe et les sciences", tokens:40000, ctx:"40K", temp:0.5 },
  { id:"nvidia/llama-3.1-nemotron-ultra-253b-v1:free",  name:"⚡ Nemotron Ultra 253B — Raisonnement (Gratuit)", badge:"🆓 Raisonnement", desc:"NVIDIA ultra performant 253B, explications pas-à-pas approfondies", tokens:128000, ctx:"128K", temp:0.5 },
  { id:"google/gemma-3-27b-it:free",                    name:"🔷 Gemma 3 27B — Google Open (Gratuit)",    badge:"🆓 Gratuit",     desc:"Modèle open-source Google, 27B paramètres équilibré via OpenRouter",     tokens:96000, ctx:"96K", temp:0.5 },
  { id:"meta-llama/llama-4-scout:free",                 name:"🦙 Llama 4 Scout — Ultra Rapide (Gratuit)", badge:"🆓 Rapide",      desc:"Meta Llama 4 Scout, réponse instantanée, multilingue, 100% gratuit",     tokens:512000, ctx:"512K", temp:0.5 },
  { id:"mistralai/mistral-small-3.2-24b-instruct:free", name:"🔥 Mistral Small 3.2 24B (Gratuit)",        badge:"🆓 Gratuit",     desc:"Mistral 24B instruct, léger, rapide, multilingue, 100% gratuit",        tokens:128000, ctx:"128K", temp:0.42 },

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
