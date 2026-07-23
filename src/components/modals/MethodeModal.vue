<template>
  <!-- ═══════════════════ MODAL : FICHE MÉTHODE ═══════════════════ -->
  <div class="modal-overlay" id="methode-modal">
    <div class="modal-box" style="max-width:680px;max-height:90vh;overflow-y:auto">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>

      <!-- ── Header ── -->
      <div class="modal-header">
        <div class="modal-title" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">🧠</span>
          Générateur de Fiche Méthode
        </div>
        <button class="modal-close" id="close-methode-modal">✕</button>
      </div>

      <div class="modal-body">

        <!-- ── Progress bar ── -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:20px">
          <div class="corr-step-dot active" id="mdot-1">1</div>
          <div class="corr-step-line" id="mline-1"></div>
          <div class="corr-step-dot" id="mdot-2">2</div>
          <div class="corr-step-line" id="mline-2"></div>
          <div class="corr-step-dot" id="mdot-3">3</div>
          <div class="corr-step-line" id="mline-3"></div>
          <div class="corr-step-dot" id="mdot-4">4</div>
          <div style="margin-left:10px;font-size:11px;color:var(--text-dim)" id="methode-step-label">Contexte général</div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 1 — Contexte général
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="methode-step-1">
          <div class="info-block" style="border-left-color:var(--neon);margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="color:var(--neon)">🎯 Étape 1 / 4 — Contexte général</strong><br>
              Spécifiez la matière, le niveau et le rôle attendu de l'IA.
            </div>
            <div class="corr-save-load-controls" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
              <select class="field-input field-select" id="methode-saved-list" style="width:auto; padding:6px; font-size:12px; background:rgba(0,0,0,0.2)">
                <option value="">— Profils sauvegardés —</option>
              </select>
              <button class="btn-ghost" id="methode-load-btn" @click="handleLoadConfig" style="border:1px dashed rgba(255,255,255,0.2); font-size:12px; padding:6px 12px; background:rgba(0,0,0,0.2)">📂 Charger</button>
              <button class="btn-ghost" id="methode-delete-save-btn" @click="handleDeleteSave" style="border:1px dashed rgba(255,100,100,0.4); font-size:12px; padding:6px 12px; background:rgba(255,0,0,0.1); color:#ff6b6b">🗑️</button>
            </div>
          </div>

          <!-- Discipline -->
          <div class="field-group">
            <label class="field-label">📚 Discipline / Matière <span style="color:var(--danger)">*</span></label>
            <select class="field-input field-select" id="methode-discipline" @change="handleDisciplineChange">
              <option value="">— Choisir une discipline —</option>
              <optgroup label="Sciences">
                <option value="SVT" selected>SVT (Sciences de la Vie et de la Terre)</option>
                <option value="Physique-Chimie">Physique-Chimie</option>
                <option value="Maths">Mathématiques</option>
                <option value="Informatique">Informatique / NSI</option>
              </optgroup>
              <optgroup label="Lettres & Langues">
                <option value="Français">Français / Littérature</option>
                <option value="Anglais">Anglais (English)</option>
                <option value="Arabe">اللغة العربية (Arabe)</option>
                <option value="Espagnol">Espagnol</option>
                <option value="Philosophie">Philosophie</option>
              </optgroup>
              <optgroup label="Autres">
                <option value="Histoire-Géo">Histoire-Géographie</option>
                <option value="Économie">Économie / SES</option>
                <option value="Autre">Autre discipline</option>
              </optgroup>
            </select>
          </div>

          <!-- Discipline personnalisée -->
          <div class="field-group" id="methode-custom-discipline-group" style="display:none">
            <label class="field-label">✏️ Nom de la discipline</label>
            <input type="text" class="field-input" id="methode-custom-discipline"
              placeholder="Ex : Chimie Organique, Droit, Comptabilité…">
          </div>

          <!-- Niveau & Langue -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <!-- Niveau scolaire -->
            <div class="field-group">
              <label class="field-label">🎓 Niveau scolaire <span style="color:var(--danger)">*</span></label>
              <select class="field-input field-select" id="methode-niveau">
                <option value="">— Choisir —</option>
                <optgroup label="Lycée">
                  <option value="Tronc Commun (TC)">Tronc Commun (TC)</option>
                  <option value="1ère Année Bac (1BAC)">1ère Année Bac (1BAC)</option>
                  <option value="2ème Année Bac (2BAC)" selected>2ème Année Bac (2BAC)</option>
                </optgroup>
                <optgroup label="Collège">
                  <option value="1ère Année Collège (1AC)">1ère Année Collège (1AC)</option>
                  <option value="2ème Année Collège (2AC)">2ème Année Collège (2AC)</option>
                  <option value="3ème Année Collège (3AC)">3ème Année Collège (3AC)</option>
                </optgroup>
              </select>
            </div>

            <!-- Niveau de langue de l'élève -->
            <div class="field-group">
              <label class="field-label">🗣️ Niveau de langue de l'élève <span style="color:var(--danger)">*</span></label>
              <select class="field-input field-select" id="methode-niveau-langue">
                <option value="B1-B2 (français langue seconde)" selected>B1-B2 (français langue seconde)</option>
                <option value="Langue maternelle">Langue maternelle</option>
                <option value="Langue soutenue">Langue soutenue</option>
                <option value="A1-A2 (débutant)">A1-A2 (débutant)</option>
              </select>
            </div>
          </div>

          <!-- Langue de génération de la fiche -->
          <div class="field-group" style="margin-top:12px">
            <label class="field-label">🌍 Langue de génération de la fiche</label>
            <select class="field-input field-select" id="methode-output-lang">
              <option value="fr" selected>🇫🇷 Français (par défaut)</option>
              <option value="en">🇬🇧 English</option>
              <option value="ar">🇲🇦 العربية (Arabe)</option>
            </select>
            <div class="field-hint" style="margin-top:4px;font-size:11px;color:var(--text-dim)">
              ℹ️ Détection automatique si la matière est « Arabe » ou « Anglais ».
            </div>
          </div>

          <!-- Modèle IA à utiliser -->
          <div class="field-group" style="margin-top:12px">
            <label class="field-label">🤖 Modèle IA à utiliser</label>
            <select class="field-input field-select" id="methode-model-select">
              <option value="gemini-3.5-flash" selected>✨ Gemini 3.5 Flash — Vision & PDF (par défaut)</option>
            </select>
            <div class="field-hint" style="margin-top:4px;font-size:11px;color:var(--text-dim)">
              ✨ Gemini 3.5 Flash recommandé pour lire les PDF natifs (graphiques inclus). Les autres modèles liront le texte extrait du PDF.
            </div>
          </div>

          <!-- Rôle & expertise IA -->
          <div class="field-group">
            <label class="field-label">🤖 Rôle et expertise de l'IA <span style="color:var(--danger)">*</span></label>
            <textarea class="field-textarea" id="methode-role" rows="5"
              placeholder="Ex : Tu es un tuteur en Mathématiques, spécialisé en analyse et résolution de problèmes complexes.">Tu es un expert pédagogique spécialisé dans la conception de fiches méthode pour les élèves du collège et du lycée marocain (de la 1AC au 2BAC), toutes disciplines confondues — Sciences, Mathématiques, Lettres, Langues, Histoire-Géographie, Philosophie et Économie. Ton rôle est de produire des fiches méthode rigoureuses, concrètes et immédiatement utilisables : tu corriges les erreurs identifiées, tu déconstruis la démarche attendue étape par étape, et tu fournis un modèle de travail explicite et reproductible que l'élève peut appliquer de façon autonome à tout exercice similaire. Tu ne te contentes pas d'expliquer — tu montres exactement ce qu'il faut faire, dans quel ordre et pourquoi, avec des exemples rédigés et des formulations modèles prêtes à réutiliser.</textarea>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="close-methode-modal-step1" @click="handleClose">Annuler</button>
            <button class="btn-primary" id="methode-next-1" @click="handleNext1">Suivant →</button>
          </div>
        </div>


        <!-- ══════════════════════════════════════════
             ÉTAPE 2 — L'Exercice / Problème
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="methode-step-2" style="display:none">
          <div class="info-block" style="border-left-color:var(--cyan);margin-bottom:16px">
            <strong style="color:var(--cyan)">📄 Étape 2 / 4 — Données d'entrée (L'exercice)</strong><br>
            Collez l'exercice (les questions et les documents) ou importez un PDF.
          </div>

          <!-- Zone Exercice -->
          <div class="field-group">
            <label class="field-label">📋 Énoncé de l'exercice et ressources <span style="color:var(--danger)">*</span></label>
            <textarea class="field-textarea" id="methode-exercice" rows="10"
              placeholder="Collez ici l'exercice complet (contexte, questions et données associées)…"></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="methode-pdf-upload" class="corr-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer un fichier (PDF, image ou TXT)
              </label>
              <input type="file" id="methode-pdf-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="methode-pdf-badge" style="display:none;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#a78bfa"></span>
              <button id="methode-pdf-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="methode-pdf-info" style="display:none;margin-top:8px;padding:8px 12px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:6px;font-size:11px;color:#a78bfa">
              ✅ Fichier d'exercice chargé en mémoire.
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="methode-back-2" @click="handleBack(1)">← Retour</button>
            <button class="btn-primary" id="methode-next-2" @click="handleNext2">Suivant →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 3 — Référentiel & Modèles
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="methode-step-3" style="display:none">
          <div class="info-block" style="border-left-color:#a78bfa;margin-bottom:16px">
            <strong style="color:#a78bfa">🧠 Étape 3 / 4 — Référentiel & Modèles</strong><br>
            Spécifiez le cadre de compétences, un exemple de fiche (Few-shot) ou des consignes spécifiques.
          </div>

          <!-- Référentiel de compétences -->
          <div class="field-group">
            <label class="field-label">🎯 Référentiel de compétences officiel <span style="color:var(--danger)">*</span></label>
            <textarea class="field-textarea" id="methode-competences" rows="4"
              placeholder="Collez ici les compétences attendues (ex: Analyser, Résoudre, Restituer)…"></textarea>
            
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="methode-ref-upload" class="corr-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer un Cadre de Référence (PDF/Image/TXT)
              </label>
              <input type="file" id="methode-ref-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="methode-ref-badge" style="display:none;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#a78bfa"></span>
              <button id="methode-ref-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
          </div>

          <!-- Exemple de fiche (Few-shot) -->
          <div class="field-group" style="margin-top: 16px;">
            <label class="field-label">📎 Exemple de fiche modèle <span style="font-weight:normal;color:var(--text-dim)">(Few-Shot, Optionnel)</span></label>
            <textarea class="field-textarea" id="methode-exemple" rows="3"
              placeholder="Collez ici un exemple de fiche méthode réussie en XML..."></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
              <label for="methode-exemple-upload" class="corr-upload-btn" style="border-color:rgba(245,158,11,0.5);color:#f59e0b;background:rgba(245,158,11,0.07)">
                <span style="font-size:13px">📄</span>
                Importer une fiche modèle (PDF / Image / TXT / MD)
              </label>
              <input type="file" id="methode-exemple-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="methode-exemple-badge" style="display:none;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#f59e0b"></span>
              <button id="methode-exemple-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="methode-exemple-info" style="display:none;margin-top:6px;padding:8px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:6px;font-size:11px;color:#f59e0b">
              ✅ Fiche modèle importée avec succès.
            </div>
          </div>

          <!-- Style, Ton & Directives spécifiques -->
          <div class="field-group" style="margin-top:16px;">
            <label class="field-label">📐 Style, Ton & Consignes supplémentaires</label>
            <textarea class="field-textarea" id="methode-directives" rows="3"
              placeholder="Ex : Ton encourageant et patient, style clair et pédagogique, explications courtes..."></textarea>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="methode-back-3" @click="handleBack(2)">← Retour</button>
            <button class="btn-primary" id="methode-next-3" @click="handleNext3">Vérifier →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 4 — Résumé & Génération
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="methode-step-4" style="display:none">
          <div class="info-block" style="border-left-color:#f59e0b;margin-bottom:16px">
            <strong style="color:#f59e0b">🚀 Étape 4 / 4 — Prêt à générer</strong><br>
            Vérifiez le résumé ci-dessous avant de lancer la génération.
          </div>

          <!-- Résumé -->
          <div id="methode-summary" style="background:var(--void);border:1px solid var(--grid);border-radius:var(--r);padding:14px;font-size:12px;line-height:1.8;margin-bottom:16px">
            <!-- Rempli dynamiquement -->
          </div>

          <!-- Option export Word -->
          <div class="field-group" style="margin-bottom:12px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim)">
              <input type="checkbox" id="methode-export-word" style="accent-color:var(--neon)">
              <span>📄 Exporter automatiquement en Word (.doc) après génération</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="methode-export-html" style="accent-color:var(--neon)">
              <span>🌐 Exporter automatiquement en HTML (Idéal pour les formules scientifiques)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="methode-export-pdf" style="accent-color:var(--neon)">
              <span>📕 Exporter automatiquement en PDF (Rendu parfait)</span>
            </label>
          </div>

          <!-- Info moteur IA utilisé -->
          <div id="methode-engine-gemini" style="font-size:11px;color:#34d399;margin-bottom:12px;padding:8px 12px;background:rgba(52,211,153,0.08);border-radius:6px;border:1px solid rgba(52,211,153,0.3)">
            ✨ <strong>Gemini 2.5 Flash activé</strong> — Requis pour la structuration XML de la Fiche Méthode.
          </div>

          <div class="btn-row" style="flex-wrap: wrap;">
            <button class="btn-ghost" id="methode-back-4" @click="handleBack(3)">← Retour</button>
            <button class="btn-ghost" id="methode-save-btn" @click="handleSaveConfig" style="border:1px dashed var(--cyan); color:var(--cyan)">💾 Sauvegarder config</button>
            <button class="btn-primary" id="methode-generate-btn" @click="handleGenerate" style="background:linear-gradient(135deg,var(--neon),var(--cyan));color:#000;font-weight:700;gap:8px">
              <span>🎯</span> GÉNÉRER LA FICHE MÉTHODE
            </button>
          </div>
        </div>

      </div><!-- /modal-body -->
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

const DEFAULT_ROLE = `Tu es un expert pédagogique spécialisé dans la conception de fiches méthode pour les élèves du collège et du lycée marocain (de la 1AC au 2BAC), toutes disciplines confondues — Sciences, Mathématiques, Lettres, Langues, Histoire-Géographie, Philosophie et Économie. Ton rôle est de produire des fiches méthode rigoureuses, concrètes et immédiatement utilisables : tu corriges les erreurs identifiées, tu déconstruis la démarche attendue étape par étape, et tu fournis un modèle de travail explicite et reproductible que l'élève peut appliquer de façon autonome à tout exercice similaire. Tu ne te contentes pas d'expliquer — tu montres exactement ce qu'il faut faire, dans quel ordre et pourquoi, avec des exemples rédigés et des formulations modèles prêtes à réutiliser.`;

// Pré-remplissage du rôle par défaut au montage du composant
onMounted(() => {
  const roleEl = document.getElementById('methode-role');
  if (roleEl && !roleEl.value.trim()) {
    roleEl.value = DEFAULT_ROLE;
  }
});

// Exposer le défaut pour que legacy.js puisse l'utiliser à l'ouverture
window.DEFAULT_METHODE_ROLE_TEXT = DEFAULT_ROLE;

// Appel des fonctions globales exposées par legacy.js
const handleClose = () => window.closeMethodeModal?.();
const handleBack = (step) => window.methodeShowStep?.(step);

const handleNext1 = () => {
  if (!window.methodeValidateStep1?.()) return;
  window.methodeShowStep?.(2);
};

const handleNext2 = () => {
  if (!window.methodeValidateStep2?.()) return;
  window.methodeShowStep?.(3);
};

const handleNext3 = () => {
  window.methodeBuildSummary?.();
  window.methodeShowStep?.(4);
};

const handleGenerate = () => {
  window.generateMethodeSheet?.();
};

const handleSaveConfig = () => {
  document.dispatchEvent(new CustomEvent('do-save-methode-config'));
};

const handleLoadConfig = () => {
  document.dispatchEvent(new CustomEvent('do-load-methode-config'));
};

const handleDeleteSave = () => {
  document.dispatchEvent(new CustomEvent('do-delete-methode-config'));
};

// Auto-détection langue selon la discipline choisie
const handleDisciplineChange = (e) => {
  const langSel = document.getElementById('methode-output-lang');
  if (!langSel) return;
  if (e.target.value === 'Arabe') langSel.value = 'ar';
  else if (e.target.value === 'Anglais') langSel.value = 'en';
  else langSel.value = 'fr';
};
</script>

<style scoped>
.corr-step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--grid);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  flex-shrink: 0;
  transition: all 0.3s;
}
.corr-step-dot.active {
  border-color: var(--neon);
  color: var(--neon);
  box-shadow: 0 0 10px rgba(0, 255, 157, 0.4);
}
.corr-step-dot.done {
  border-color: var(--cyan);
  background: rgba(0, 229, 255, 0.15);
  color: var(--cyan);
}
.corr-step-line {
  flex: 1;
  height: 2px;
  background: var(--grid);
  transition: background 0.3s;
}
.corr-step-line.done {
  background: var(--cyan);
}
.corr-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 4px 12px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 20px;
  font-size: 11px;
  color: var(--cyan);
  background: rgba(0, 229, 255, 0.07);
  transition: background 0.2s, border-color 0.2s;
  user-select: none;
}
.corr-upload-btn:hover {
  background: rgba(0, 229, 255, 0.14);
  border-color: rgba(0, 229, 255, 0.6);
}
.file-remove-btn {
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.4);
  border-radius: 50%;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 11px;
  width: 18px;
  height: 18px;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  transition: background 0.2s;
  flex-shrink: 0;
}
.file-remove-btn:hover {
  background: rgba(255, 100, 100, 0.35);
}
</style>
