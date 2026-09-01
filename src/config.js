export const MODELS = [

  // ══════════════════════════════════════════════════
  // ✨ GOOGLE GEMINI  (api.generativelanguage.googleapis.com)
  // ══════════════════════════════════════════════════
  { id:"gemini-3.6-flash",                              name:"✨ Gemini 3.6 Flash — Ultra Réactif",      badge:"✨ Rapide",       desc:"Vision native PDF/images, ultra fluide et précis",                      tokens:1000000, ctx:"1M",  temp:0.4, vision:true, pdfNative:true },
  { id:"gemini-3.1-pro",                                name:"🧠 Gemini 3.1 Pro — Expert Raisonnement",  badge:"🧠 Expert",       desc:"Raisonnement très poussé, correction d'épreuves complexes (contexte 2M)", tokens:2000000, ctx:"2M",  temp:0.4, vision:true, pdfNative:true },
  { id:"gemini-3.7-flash",                              name:"✨ Gemini 3.7 Flash — Raisonnement & Vision",badge:"✨ Nouveau",   desc:"Dernière génération, multimodal, pensée hybride et rapidité",           tokens:1000000, ctx:"1M",  temp:0.4, vision:true, pdfNative:true },
  { id:"gemini-2.5-pro",                                name:"🧠 Gemini 2.5 Pro — Expert Raisonnement",   badge:"🧠 Expert",       desc:"Raisonnement très poussé, correction d'épreuves complexes (contexte 2M)", tokens:2000000, ctx:"2M",  temp:0.4, vision:true, pdfNative:true },
  { id:"google/gemma-3-27b-it:free",                    name:"🔷 Gemma 3 27B — Open Source (Gratuit)",   badge:"🆓 Gratuit",      desc:"Open-source Google, 27B paramètres via OpenRouter",                     tokens:96000,  ctx:"96K",  temp:0.5 },
  { id:"google/gemma-3-12b-it:free",                    name:"🔷 Gemma 3 12B — Compact (Gratuit)",       badge:"🆓 Gratuit",      desc:"Open-source Google, 12B équilibré et gratuit via OpenRouter",            tokens:96000,  ctx:"96K",  temp:0.5 },

  // ══════════════════════════════════════════════════
  // 🔥 MISTRAL AI  (api.mistral.ai)
  // ══════════════════════════════════════════════════
  { id:"mistral-large-2512",                            name:"🔥 Mistral Large 3 — Puissant",            badge:"🔥 Puissant",     desc:"41B actifs / 675B total, multimodal, raisonnement complexe",            tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"mistral-medium-2604",                           name:"🔥 Mistral Medium 3.5 — Flagship",         badge:"🔥 Flagship",     desc:"Frontier-class 128B, multimodal, agents & code (avr. 2026)",           tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"magistral-medium-2509",                         name:"🔥 MagiCore — Raisonnement",               badge:"🔥 Raisonnement", desc:"Frontier-class multimodal reasoning (sept. 2025)",                      tokens:75000,  ctx:"1B",   temp:0.48 },
  { id:"devstral-2512",                                 name:"💻 DevMind Ultra — Dev Full-Stack",        badge:"💻 Dev",          desc:"Frontier code agents, exploration codebase, multi-fichiers",            tokens:256000, ctx:"256K", temp:0.48 },
  { id:"codestral-2508",                                name:"💻 CodeForge (Codestral) — Code",          badge:"💻 Code",         desc:"Expert génération et optimisation de code, tous langages",              tokens:256000, ctx:"256K", temp:0.48 },
  { id:"mistral-small-2603",                            name:"⚡ Mistral Small 4 — Hybride",             badge:"⚡ Hybride",      desc:"Instruct + reasoning + code unifié, 6.5B actifs (mars 2026)",          tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"ministral-14b-2512",                            name:"🔥 MiniTitan 14B — Haute Performance",     badge:"🔥 Puissant",     desc:"Best-in-class 14B, texte + vision, performance dense",                  tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"ministral-8b-2512",                             name:"⚡ MicroGenius 8B — Usage Quotidien",      badge:"⚡ Rapide",       desc:"Compact, rapide, texte + vision, usage quotidien",                      tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"ministral-3b-2512",                             name:"⚡ NanoMind 3B — Ultra Rapide",            badge:"⚡ Ultra",        desc:"Ultra-rapide, texte + vision, idéal micro-tâches",                      tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"open-mistral-nemo",                             name:"⚡ Nemo OpenCore — Open Source",           badge:"⚡ Open",         desc:"12B multilingue, polyvalent, open-source, fiable",                      tokens:128000, ctx:"128K", temp:0.42 },
  { id:"labs-mistral-small-creative",                   name:"✨ CreatiFlow — Créatif (Labs)",           badge:"✨ Créatif",      desc:"Écriture créative, brainstorming, narration (expérimental)",            tokens:256000, ctx:"256K", temp:0.42 },
  { id:"voxtral-small-2507",                            name:"🎵 Voxtral Sonic — Audio Rapide",          badge:"🎵 Audio",        desc:"Audio rapide, transcription intelligente multi-langues",                tokens:50000,  ctx:"4M",   temp:0.42, audio:true },
  { id:"voxtral-mini-2507",                             name:"🎵 Voxtral Echo — Audio Léger",            badge:"🎵 Audio",        desc:"Traitement audio, transcription légère et précise",                     tokens:50000,  ctx:"4M",   temp:0.42, audio:true },
  { id:"mistralai/mistral-small-3.2-24b-instruct:free", name:"🔥 Mistral Small 3.2 24B (Gratuit)",       badge:"🆓 Gratuit",      desc:"Mistral 24B instruct, léger, rapide, multilingue, 100% gratuit",        tokens:128000, ctx:"128K", temp:0.42 },

  // ══════════════════════════════════════════════════
  // 🧠 DEEPSEEK  (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"deepseek/deepseek-chat",                        name:"🧠 DeepSeek Chat v3",                      badge:"🧠 Intelligent",  desc:"Modèle très avancé DeepSeek via OpenRouter",                            tokens:64000,  ctx:"64K",  temp:0.5 },
  { id:"deepseek/deepseek-r1",                            name:"🧠 DeepSeek R1 — Raisonnement",            badge:"🧠 Avancé",      desc:"Raisonnement avancé chain-of-thought via OpenRouter (Version Payante)",     tokens:64000,  ctx:"64K",  temp:0.5 },

  // ══════════════════════════════════════════════════
  // 🦙 META  (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"meta-llama/llama-4-maverick:free",              name:"🦙 Llama 4 Maverick — Vision (Gratuit)",   badge:"🆓 Gratuit",      desc:"Meta Llama 4, vision + texte, contexte 1M, 100% gratuit",               tokens:1000000, ctx:"1M", temp:0.5, vision:true },
  { id:"meta-llama/llama-4-scout:free",                 name:"🦙 Llama 4 Scout — Rapide (Gratuit)",      badge:"🆓 Gratuit",      desc:"Meta Llama 4 Scout, multilingue, très rapide, 100% gratuit",            tokens:512000, ctx:"512K", temp:0.5 },

  // ══════════════════════════════════════════════════
  // 🌐 ALIBABA / QWEN  (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"qwen/qwen3-235b-a22b:free",                     name:"🌐 Qwen 3 235B — Ultra Grand (Gratuit)",   badge:"🆓 Gratuit",      desc:"Très grand modèle Alibaba, multilingue excellent, gratuit",             tokens:40000,  ctx:"40K",  temp:0.5 },
  { id:"qwen/qwen3-30b-a3b:free",                       name:"🌐 Qwen 3 30B — Compact (Gratuit)",        badge:"🆓 Gratuit",      desc:"Modèle Alibaba 30B, multilingue, équilibré et gratuit",                 tokens:40000,  ctx:"40K",  temp:0.5 },

  // ══════════════════════════════════════════════════
  // ⚡ NVIDIA  (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"nvidia/llama-3.1-nemotron-ultra-253b-v1:free",  name:"⚡ Nemotron Ultra 253B — NVIDIA (Gratuit)", badge:"🆓 Gratuit",      desc:"NVIDIA ultra performant, 253B, hautes performances, gratuit",           tokens:128000, ctx:"128K", temp:0.5 },

  // ══════════════════════════════════════════════════
  // 💡 MICROSOFT  (OpenRouter)
  // ══════════════════════════════════════════════════
  { id:"microsoft/phi-4",                                 name:"💡 Phi-4 — Microsoft",                         badge:"💡 Rapide",      desc:"Microsoft Phi-4, raisonnement logique avancé, compact",                  tokens:32000,  ctx:"32K",  temp:0.4 },

  // ══════════════════════════════════════════════════
  // 🤖 xAI / GROK  (api.x.ai)
  // ══════════════════════════════════════════════════
  { id:"grok-4",                                          name:"🤖 Grok 4 — xAI Ultra",                        badge:"🤖 Ultra",       desc:"Grok 4 by xAI, raisonnement frontier, très avancé (2025)",               tokens:131072, ctx:"128K", temp:0.42, xai:true },
  { id:"grok-4-5",                                        name:"🤖 Grok 4.5 — xAI Frontier",                   badge:"🤖 Frontier",    desc:"Grok 4.5 by xAI, modèle de pointe avec raisonnement avancé",             tokens:131072, ctx:"128K", temp:0.42, xai:true },
  { id:"grok-3-mini",                                     name:"🤖 Grok 3 Mini — xAI Rapide",                  badge:"🤖 Rapide",      desc:"Grok 3 Mini by xAI, rapide et efficace pour tâches quotidiennes",        tokens:131072, ctx:"128K", temp:0.42, xai:true }

];

export const DB_NAME = "QCM_EDU_MAROC_DB";
export const DB_VERSION = 3;

// ══════════════════════════════════════════════════════════════════════
// 🤖 xAI PROXY URL (Cloudflare Worker)
// ══════════════════════════════════════════════════════════════════════
// Après avoir déployé cf-worker/xai-cors-proxy.js sur Cloudflare Workers,
// remplacez la valeur ci-dessous par l'URL de votre Worker :
// Ex : "https://xai-proxy.votre-nom.workers.dev"
export const XAI_PROXY_URL = "https://xai-proxy.bh-gravity8.workers.dev";
