/**
 * SCRIPT DÉFINITIF - Ajoute le module "Fiche de Correction" à legacy.js
 * Doit être exécuté UNE SEULE FOIS sur le fichier de base propre.
 */
const fs = require('fs');

const LEGACY_PATH = 'src/legacy.js';
let c = fs.readFileSync(LEGACY_PATH, 'utf8');

// ── Vérification : ne pas appliquer deux fois ─────────────────────────
if (c.includes('CORRECTION_SYSTEM_PROMPT')) {
  console.log('Module correction déjà présent, abandon.');
  process.exit(0);
}

// ── Vérification syntaxique de départ ────────────────────────────────
const { execSync } = require('child_process');
try { execSync(`node --check ${LEGACY_PATH}`, { stdio: 'pipe' }); }
catch(e) { console.error('ERREUR : le fichier de base a déjà une erreur de syntaxe !\n', e.stderr?.toString()); process.exit(1); }
console.log('✅ Fichier de base syntaxiquement correct.');

// ═══════════════════════════════════════════════════════════════════════════
// BLOC 1 : Injecter les constantes et fonctions de correction
//          juste AVANT la fermeture de bindEvents() [repère : "// OFFLINE MODE"]
// ═══════════════════════════════════════════════════════════════════════════
const INJECT_BEFORE = `// OFFLINE MODE DETECTION`;

const CORRECTION_MODULE = `// ════════════════════════════════════════════════════════
// MODULE : FICHE DE CORRECTION GÉNÉRIQUE
// ════════════════════════════════════════════════════════

// ── Référentiel compétences par discipline ─────────────
const CORRECTION_COMPETENCES = {
  "SVT":             "Décrire et analyser des données scientifiques, Déduire et interpréter, Réaliser un schéma fonctionnel, Raisonner en mobilisant les connaissances",
  "Physique-Chimie": "Analyser des données expérimentales, Modéliser une situation physique, Calculer et appliquer des formules, Raisonner et argumenter",
  "Maths":           "Modéliser et traduire en équation, Calculer et appliquer, Raisonner et démontrer, Représenter graphiquement",
  "Informatique":    "Analyser un problème algorithmique, Concevoir et implémenter, Tester et déboguer, Modéliser des données",
  "Français":        "Comprendre un texte, Analyser des procédés littéraires, Rédiger avec cohérence, Argumenter et justifier",
  "Anglais":         "Reading comprehension, Writing skills, Grammar accuracy, Vocabulary use, Oral expression",
  "Arabe":           "فهم النص وتحليله، الكتابة والتعبير، القواعد اللغوية، الثروة اللغوية",
  "Espagnol":        "Comprensión lectora, Expresión escrita, Gramática, Vocabulario",
  "Histoire-Géo":    "Maîtriser les repères, Contextualiser, Analyser un document, Construire une argumentation",
  "Économie":        "Analyser un document économique, Mobiliser les notions, Raisonner, Construire un développement",
  "Philosophie":     "Problématiser, Analyser un concept, Argumenter, Illustrer avec des exemples",
  "EPS":             "Réaliser une performance motrice, S'organiser collectivement, Analyser sa pratique",
  "Arts":            "Observer et décrire une œuvre, Analyser le contexte, Créer et justifier ses choix",
  "Autre":           "Maîtriser les connaissances fondamentales, Analyser et raisonner, Communiquer avec précision, Résoudre des problèmes"
};

const CORRECTION_SYSTEM_PROMPT = \`<system_instructions>
  <role>Tu es un expert en ingénierie pédagogique et correction de copies. Tu crées des fiches de correction précises, exploitables et adaptées au niveau des élèves.</role>

  <mission>
    Générer une fiche de correction COMPLÈTE et STRUCTURÉE pour le sujet fourni.
    La fiche doit être prête à l'emploi pour l'enseignant et les élèves.
  </mission>

  <regles_absolues>
    - Répondre UNIQUEMENT en français sauf si la discipline est une langue étrangère
    - NE JAMAIS inventer des questions ou des réponses non présentes dans le sujet
    - Adapter le niveau de langage au niveau scolaire indiqué
    - Respecter scrupuleusement le barème fourni (ou créer des espaces [Barème à définir])
    - Structurer la fiche selon le format demandé
  </regles_absolues>

  <format_obligatoire>
    Tableau 4 colonnes par défaut :
    | N° | Réponse attendue | Critères + Barème | Compétence évaluée |
    Suivi d'une section "Conseils pédagogiques" et "Erreurs fréquentes à anticiper".
  </format_obligatoire>
</system_instructions>\`;

// ── Assemblage du prompt utilisateur ──────────────────────────────────
function buildCorrectionUserPrompt(cfg) {
  return \`<user_prompt>
  <contexte>
    - Discipline : \${cfg.discipline}
    - Niveau : \${cfg.niveau}
    - Filière : \${cfg.filiere || 'N/A'}
    - Option : \${cfg.option || 'N/A'}
    - Type d'évaluation : \${cfg.typeEval}
    \${cfg.niveauLangue ? '- Niveau de langue : ' + cfg.niveauLangue : ''}
  </contexte>
  <sujet>\${cfg.sujet}</sujet>
  <bareme>\${cfg.bareme || '[Non fourni — créer des espaces [Barème à définir]]'}</bareme>
  <format>\${cfg.format || 'Tableau 4 colonnes + Conseils pédagogiques'}</format>
  <competences>\${cfg.competences || '[Proposer des compétences génériques adaptées]'}</competences>
  <criteres>\${cfg.criteres || '[Aucun critère spécifique]'}</criteres>
  <consignes>\${cfg.consignes || '[Aucune consigne supplémentaire]'}</consignes>
  <exemple>\${cfg.exemple || '[Aucun exemple fourni]'}</exemple>
  \${cfg.exportWord ? '<export>[EXPORT_WORD] à la fin de ta réponse</export>' : ''}
</user_prompt>\`;
}

// ── Variables fichier PDF/Vision ───────────────────────────────────────
let _corrPdfName   = '';
let _corrPdfBase64 = null;
let _corrPdfMime   = '';

// ── Fonctions de navigation du wizard ─────────────────────────────────
const CORR_LABELS = ['Contexte pédagogique', 'Sujet & Barème', 'Compétences & Options', 'Résumé & Génération'];

function corrShowStep(n) {
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('corr-step-' + i);
    if (el) el.style.display = (i === n) ? 'block' : 'none';
  });
  for (let i = 1; i <= 4; i++) {
    const dot  = document.getElementById('cdot-' + i);
    const line = document.getElementById('cline-' + i);
    if (!dot) continue;
    dot.className = 'corr-step-dot' + (i < n ? ' done' : i === n ? ' active' : '');
    if (line) line.className = 'corr-step-line' + (i < n ? ' done' : '');
  }
  const lbl = document.getElementById('corr-step-label');
  if (lbl) lbl.textContent = CORR_LABELS[n - 1];
  if (n === 4) {
    const hasGemini = !!(window._state?.geminiApiKey || (typeof state !== 'undefined' && state?.geminiApiKey));
    const gemBadge  = document.getElementById('corr-engine-gemini');
    const mistBadge = document.getElementById('corr-engine-mistral');
    if (gemBadge)  gemBadge.style.display  = hasGemini ? 'block' : 'none';
    if (mistBadge) mistBadge.style.display = hasGemini ? 'none'  : 'block';
  }
}

function corrFillCompetences() {
  const discEl     = document.getElementById('corr-discipline');
  const compEl     = document.getElementById('corr-competences');
  const langGroup  = document.getElementById('corr-langue-group');
  const customGrp  = document.getElementById('corr-custom-discipline-group');
  if (!discEl || !compEl) return;
  const disc   = discEl.value;
  const isLang = ['Anglais','Arabe','Espagnol','Français'].includes(disc);
  if (langGroup)  langGroup.style.display  = isLang         ? 'block' : 'none';
  if (customGrp)  customGrp.style.display  = disc === 'Autre' ? 'block' : 'none';
  // Only auto-fill if field is empty or was auto-filled (not manually edited)
  if (!compEl.dataset.manualEdit) {
    compEl.value = CORRECTION_COMPETENCES[disc] || CORRECTION_COMPETENCES['Autre'];
  }
}

function corrBuildSummary() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const disc  = get('corr-discipline') === 'Autre' ? (get('corr-custom-discipline') || 'Autre') : get('corr-discipline');
  const niv   = get('corr-niveau') || '—';
  const fil   = get('corr-filiere');
  const opt   = get('corr-option');
  const type  = get('corr-type-eval') || '—';
  const fmt   = (get('corr-format') || '').split('(')[0].trim();
  const sujet = get('corr-sujet');
  const prev  = sujet.slice(0, 120) + (sujet.length > 120 ? '…' : '');
  const classe = [niv, fil && !fil.includes('Aucune') ? '- ' + fil : '', opt && !opt.includes('Générale') ? '(' + opt + ')' : ''].filter(Boolean).join(' ').trim();
  const html = \`<div style="display:grid;gap:6px">
    <div><span style="color:var(--text-dim)">📚 Discipline :</span> <strong style="color:var(--cyan)">\${disc || '—'}</strong></div>
    <div><span style="color:var(--text-dim)">🎓 Classe :</span> <strong style="color:var(--neon)">\${classe}</strong></div>
    <div><span style="color:var(--text-dim)">📝 Type :</span> \${type}</div>
    <div><span style="color:var(--text-dim)">🗂️ Format :</span> \${fmt || '—'}</div>
    <div><span style="color:var(--text-dim)">⚖️ Barème :</span> \${get('corr-bareme') ? '<span style="color:#a78bfa">✓ Fourni</span>' : '<span style="color:#f59e0b">⚠ Absent</span>'}</div>
    <div><span style="color:var(--text-dim)">📋 Sujet :</span> <em style="color:var(--text-dim);font-size:11px">\${prev || '—'}</em></div>
  </div>\`;
  const el = document.getElementById('corr-summary');
  if (el) el.innerHTML = html;
}

function corrValidateStep1() {
  const disc = document.getElementById('corr-discipline')?.value;
  const niv  = document.getElementById('corr-niveau')?.value;
  if (!disc) { toast('Veuillez choisir une discipline.', 'error'); return false; }
  if (!niv)  { toast('Veuillez choisir un niveau scolaire.', 'error'); return false; }
  return true;
}

function corrValidateStep2() {
  if (_corrPdfBase64) return true;
  const sujet = document.getElementById('corr-sujet')?.value?.trim();
  if (!sujet || sujet.length < 20) {
    toast('Veuillez coller le sujet (min. 20 caractères) ou importer un PDF.', 'error');
    return false;
  }
  return true;
}

function openCorrectionModal() {
  corrShowStep(1);
  corrFillCompetences();
  const m = document.getElementById('correction-modal');
  if (m) m.classList.add('active');
}

function closeCorrectionModal() {
  const m = document.getElementById('correction-modal');
  if (m) m.classList.remove('active');
}

async function generateCorrectionSheet() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const disc = get('corr-discipline') === 'Autre' ? (get('corr-custom-discipline') || 'Autre') : get('corr-discipline');
  const hasPdf = !!_corrPdfBase64;

  const cfg = {
    discipline:   disc,
    niveau:       get('corr-niveau'),
    filiere:      get('corr-filiere'),
    option:       get('corr-option'),
    typeEval:     get('corr-type-eval'),
    niveauLangue: get('corr-niveau-langue'),
    sujet:        hasPdf ? '[DOCUMENT JOINT — voir pièce jointe]' : get('corr-sujet'),
    bareme:       get('corr-bareme'),
    format:       get('corr-format'),
    competences:  get('corr-competences'),
    criteres:     get('corr-criteres'),
    consignes:    get('corr-consignes'),
    exemple:      get('corr-exemple'),
    exportWord:   document.getElementById('corr-export-word')?.checked || false,
  };

  if (!hasPdf && (!cfg.sujet || cfg.sujet.length < 20)) {
    toast('Veuillez coller le sujet ou importer un PDF.', 'error'); return;
  }
  if (!cfg.discipline || !cfg.niveau) {
    toast('Veuillez compléter les étapes 1 et 2.', 'error'); return;
  }

  closeCorrectionModal();

  const classeStr = [cfg.niveau, cfg.filiere && !cfg.filiere.includes('Aucune') ? '- ' + cfg.filiere : '', cfg.option && !cfg.option.includes('Générale') ? '(' + cfg.option + ')' : ''].filter(Boolean).join(' ').trim();
  const titre = '📋 Fiche de Correction — ' + cfg.discipline + ' ' + classeStr + ' (' + cfg.typeEval + ')' + (hasPdf ? ' [PDF]' : '');

  if (!state.messages) state.messages = [];
  state.messages.push({ role: 'user', content: titre, ts: Date.now() });
  renderMessages();

  const assistantMsg = { role: 'assistant', content: '⏳ Génération en cours…', streaming: true, ts: Date.now() + 1, modelUsed: 'gemini-2.5-flash', isCorrection: true };
  state.messages.push(assistantMsg);
  renderMessages();

  state.isGenerating    = true;
  state.selectedWorkflow = null;
  state.agent           = null;
  state.abortController = new AbortController();
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.className = 'stop-btn'; sendBtn.innerHTML = '⏹ ARRÊTER'; }
  showTyping('gemini-2.5-flash');

  try {
    if (!state.geminiApiKey) throw new Error('Clé API Gemini manquante. Configurez-la dans Paramètres API (🔑).');

    const GEMINI_MODEL = 'gemini-2.5-flash';
    const parts = [{ text: buildCorrectionUserPrompt(cfg) }];
    if (hasPdf && _corrPdfBase64) {
      parts.unshift({ inlineData: { mimeType: _corrPdfMime || 'application/pdf', data: _corrPdfBase64 } });
      parts.splice(1, 0, { text: '\\n[DOCUMENT JOINT - analysez intégralement son contenu pour générer la fiche]\\n' });
    }

    const effectivePrompt = hasPdf
      ? CORRECTION_SYSTEM_PROMPT + '\\n\\nIMPORTANT : Un document est joint. Lisez-le INTÉGRALEMENT avant de générer quoi que ce soit.'
      : CORRECTION_SYSTEM_PROMPT;

    const payload = {
      systemInstruction: { parts: [{ text: effectivePrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 8192, topP: 0.95 }
    };

    assistantMsg.content = '🔍 Gemini analyse votre demande' + (hasPdf ? ' et lit le document…' : '…');
    renderMessages();

    const cleanKey = state.geminiApiKey.replace(/[\\r\\n\\s]+/g, '');
    const url      = '/api/gemini/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + cleanKey;
    const res      = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: state.abortController.signal, body: JSON.stringify(payload) });

    if (!res.ok) {
      const errTxt = await res.text();
      let errMsg = errTxt.slice(0, 500);
      try { const j = JSON.parse(errTxt); errMsg = j.error?.message || errMsg; } catch(e) {}
      throw new Error('Gemini API ' + res.status + ': ' + errMsg);
    }

    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error('Gemini n\\'a pas généré de texte. Raison : ' + (data?.candidates?.[0]?.finishReason || 'inconnue'));

    // Export Word si demandé
    if (cfg.exportWord && text.includes('[EXPORT_WORD]')) {
      text = text.replace('[EXPORT_WORD]', '').trim();
      try { exportToWord(text, 'Fiche_Correction_' + cfg.discipline.replace(/\\s+/g,'_') + '.doc'); toast('📄 Exporté en Word !', 'success'); } catch(e) {}
    }

    assistantMsg.content   = text;
    assistantMsg.streaming = false;
    renderMessages(true);
    hideTyping();
    await saveChat();
    _corrPdfName = ''; _corrPdfBase64 = null; _corrPdfMime = '';

  } catch(e) {
    assistantMsg.content   = '❌ Erreur : ' + e.message;
    assistantMsg.streaming = false;
    renderMessages(true);
    hideTyping();
  } finally {
    state.isGenerating = false;
    const btn2 = document.getElementById('send-btn');
    if (btn2) { btn2.className = 'send-btn'; btn2.innerHTML = '▶'; btn2.disabled = false; }
  }
}

// ── Exposition globale pour CorrectionModal.vue ────────────────────────
window.corrShowStep            = corrShowStep;
window.corrValidateStep1       = corrValidateStep1;
window.corrValidateStep2       = corrValidateStep2;
window.corrFillCompetences     = corrFillCompetences;
window.corrBuildSummary        = corrBuildSummary;
window.openCorrectionModal     = openCorrectionModal;
window.closeCorrectionModal    = closeCorrectionModal;
window.generateCorrectionSheet = generateCorrectionSheet;

// ── Wiring depuis bindEvents ───────────────────────────────────────────
(function wireCorrection() {
  // Bouton ouverture (header)
  const openBtn = document.getElementById('open-correction-modal');
  if (openBtn) openBtn.addEventListener('click', openCorrectionModal);

  // Fermeture via overlay backdrop
  const overlay = document.getElementById('correction-modal');
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeCorrectionModal(); });

  // Close button header
  const closeBtn = document.getElementById('close-correction-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeCorrectionModal);

  // Discipline change → auto-fill compétences
  const discEl = document.getElementById('corr-discipline');
  if (discEl) {
    discEl.addEventListener('change', corrFillCompetences);
    discEl.addEventListener('change', () => {
      const customGrp = document.getElementById('corr-custom-discipline-group');
      if (customGrp) customGrp.style.display = discEl.value === 'Autre' ? 'block' : 'none';
    });
  }

  // Marquer modification manuelle des compétences
  const compEl = document.getElementById('corr-competences');
  if (compEl) compEl.addEventListener('input', () => { compEl.dataset.manualEdit = '1'; });

  // Import sujet PDF/image/texte
  const pdfInput = document.getElementById('corr-pdf-upload');
  if (pdfInput) {
    pdfInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge   = document.getElementById('corr-pdf-badge');
      const info    = document.getElementById('corr-pdf-info');
      const sujetEl = document.getElementById('corr-sujet');
      const isPdf   = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');
      if (isPdf) {
        if (badge) { badge.textContent = '⏳ ' + file.name + ' — Lecture…'; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = ev => {
          _corrPdfBase64 = ev.target.result.split(',')[1];
          _corrPdfName   = file.name;
          _corrPdfMime   = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          if (badge) { badge.textContent = '📄 ' + file.name + ' (Prêt)'; badge.style.display = 'inline-block'; }
          if (info)  info.style.display = 'block';
          if (sujetEl) sujetEl.value = '[DOCUMENT ATTACHÉ: ' + file.name + ']\\nSera analysé nativement par Gemini.';
          toast('✅ ' + file.name + ' importé.', 'success');
        };
        reader.onerror = () => toast('❌ Erreur lecture fichier', 'error');
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = ev => {
          if (sujetEl) sujetEl.value = ev.target.result.trim();
          _corrPdfBase64 = null;
          if (badge) { badge.textContent = '📝 ' + file.name; badge.style.display = 'inline-block'; }
          if (info) info.style.display = 'block';
          toast('✅ Fichier texte importé.', 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    });
  }

  // Import cadre de référence (compétences)
  const refInput = document.getElementById('corr-ref-upload');
  if (refInput) {
    refInput.addEventListener('change', async (e) => {
      const file  = e.target.files[0];
      if (!file) return;
      const badge = document.getElementById('corr-ref-badge');
      if (badge) { badge.style.display = 'inline-block'; badge.textContent = '⏳ Lecture…'; }
      try {
        let text = '';
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          if (typeof extractTextFromPdf === 'function') {
            const result = await extractTextFromPdf(file);
            text = result.text;
          } else {
            text = '[PDF chargé — extractTextFromPdf non disponible]';
          }
        } else {
          text = await file.text();
        }
        if (compEl) compEl.value = text;
        if (badge) { badge.textContent = '✅ ' + file.name; badge.style.background = 'rgba(0,255,157,0.15)'; badge.style.color = 'var(--neon)'; badge.style.borderColor = 'rgba(0,255,157,0.4)'; }
        toast('✅ Cadre de référence importé.', 'success');
      } catch(err) {
        console.error(err);
        toast('Erreur lecture cadre de référence', 'error');
        if (badge) badge.textContent = '❌ Erreur';
      }
      e.target.value = '';
    });
  }

  // Bouton générer (fallback — normalement géré par Vue @click)
  const genBtn = document.getElementById('corr-generate-btn');
  if (genBtn) genBtn.addEventListener('click', generateCorrectionSheet);
})();

`;

// Injecter avant "// OFFLINE MODE DETECTION"
const injectIdx = c.indexOf(INJECT_BEFORE);
if (injectIdx === -1) {
  console.error('Impossible de trouver INJECT_BEFORE dans le fichier.');
  process.exit(1);
}

c = c.substring(0, injectIdx) + CORRECTION_MODULE + '\n' + c.substring(injectIdx);
fs.writeFileSync(LEGACY_PATH, c);
console.log('✅ Module correction injecté.');

// Vérification syntaxique finale
try {
  execSync(`node --check ${LEGACY_PATH}`, { stdio: 'pipe' });
  console.log('✅ Syntaxe vérifiée — tout est correct.');
} catch(e) {
  console.error('❌ ERREUR DE SYNTAXE après injection !\n', e.stderr?.toString());
  process.exit(1);
}
