export const MODELS = [
  // ── Modèles d'Élite & Raisonnement Complexe (Les plus performants) ──
  { id:"gemini-3.5-flash",            name:"✨ Gemini 3.5 Flash — Vision & PDF",   badge:"✨ Vision",     desc:"Vision native PDF/images, graphiques, raisonnement avancé, très rapide",   tokens:1000000, ctx:"1M",   temp:0.4, vision:true },
  { id:"mistral-large-2512",          name:"🔥 Mistral Large 3 — Puissant",        badge:"🔥 Puissant",   desc:"41B actifs / 675B total, multimodal, raisonnement complexe",   tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"deepseek/deepseek-chat",      name:"🧠 DeepSeek Chat v3",                 badge:"🧠 Intelligent",desc:"Modèle très avancé d'OpenRouter", tokens:64000, ctx:"64K", temp:0.5 },
  { id:"mistral-medium-2604",         name:"🔥 Mistral Medium 3.5 — Flagship",     badge:"🔥 Flagship",   desc:"Frontier-class 128B, multimodal, agents & code (avr. 2026)",   tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"magistral-medium-2509",       name:"🔥 MagiCore — Raisonnement",          badge:"🔥 Raisonnement", desc:"Frontier-class multimodal reasoning (sept. 2025)",          tokens:75000,  ctx:"1B",   temp:0.48 },

  // ── Code & Développement Avancé ──
  { id:"devstral-2512",               name:"💻 DevMind Ultra — Dev Full-Stack",    badge:"💻 Dev",        desc:"Frontier code agents, exploration codebase, multi-fichiers",   tokens:256000, ctx:"256K", temp:0.48 },
  { id:"codestral-2508",              name:"💻 CodeForge (Codestral) — Code",      badge:"💻 Code",       desc:"Expert génération et optimisation de code, tous langages",     tokens:256000, ctx:"256K", temp:0.48 },

  // ── Hybrides & Hautes Performances (Moyens/Compact) ──
  { id:"mistral-small-2603",          name:"⚡ Mistral Small 4 — Hybride",         badge:"⚡ Hybride",    desc:"Instruct + reasoning + code unifié, 6.5B actifs (mars 2026)", tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"ministral-14b-2512",          name:"🔥 MiniTitan 14B — Haute Performance", badge:"🔥 Puissant",  desc:"Best-in-class 14B, texte + vision, performance dense",         tokens:256000, ctx:"256K", temp:0.42, vision:true },

  // ── Edge / Rapides / Usage Quotidien ──
  { id:"ministral-8b-2512",           name:"⚡ MicroGenius 8B — Usage Quotidien",  badge:"⚡ Rapide",    desc:"Compact, rapide, texte + vision, usage quotidien",             tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"ministral-3b-2512",           name:"⚡ NanoMind 3B — Ultra Rapide",        badge:"⚡ Ultra",     desc:"Ultra-rapide, texte + vision, idéal micro-tâches",             tokens:256000, ctx:"256K", temp:0.42, vision:true },
  { id:"open-mistral-nemo",           name:"⚡ Nemo OpenCore — Open Source",       badge:"⚡ Open",      desc:"12B multilingue, polyvalent, open-source, fiable",             tokens:128000, ctx:"128K", temp:0.42 },

  // ── Créatif & Audio (Spécialisés) ──
  { id:"labs-mistral-small-creative", name:"✨ CreatiFlow — Créatif (Labs)",        badge:"✨ Créatif",   desc:"Écriture créative, brainstorming, narration (expérimental)",   tokens:256000, ctx:"256K", temp:0.42 },
  { id:"voxtral-small-2507",          name:"🎵 Voxtral Sonic — Audio Rapide",      badge:"🎵 Audio",     desc:"Audio rapide, transcription intelligente multi-langues",       tokens:50000,  ctx:"4M",   temp:0.42, audio:true },
  { id:"voxtral-mini-2507",           name:"🎵 Voxtral Echo — Audio Léger",        badge:"🎵 Audio",     desc:"Traitement audio, transcription légère et précise",            tokens:50000,  ctx:"4M",   temp:0.42, audio:true }
];

export const DB_NAME = "QCM_EDU_MAROC_DB";
export const DB_VERSION = 2;
