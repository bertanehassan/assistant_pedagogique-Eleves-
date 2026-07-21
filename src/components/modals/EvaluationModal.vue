<template>
  <!-- ═══════════════════ MODAL : GÉNÉRATEUR D'ÉVALUATIONS A/B ═══════════════════ -->
  <div class="modal-overlay" id="evaluation-modal">
    <div class="modal-box" style="max-width:700px;max-height:92vh;overflow-y:auto">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>

      <!-- ── Header ── -->
      <div class="modal-header">
        <div class="modal-title" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">📝</span>
          Générateur d'Évaluations A/B — Devoir Surveillé
        </div>
        <button class="modal-close" id="close-evaluation-modal">✕</button>
      </div>

      <div class="modal-body">

        <!-- ── Progress bar ── -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:20px">
          <div class="eval-step-dot active" id="evdot-1">1</div>
          <div class="eval-step-line" id="evline-1"></div>
          <div class="eval-step-dot" id="evdot-2">2</div>
          <div class="eval-step-line" id="evline-2"></div>
          <div class="eval-step-dot" id="evdot-3">3</div>
          <div style="margin-left:10px;font-size:11px;color:var(--text-dim)" id="eval-step-label">Contexte de l'évaluation</div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 1 — Contexte de l'évaluation
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="eval-step-1">
          <div class="info-block" style="border-left-color:#f59e0b;margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="color:#f59e0b">📋 Étape 1 / 3 — Contexte de l'évaluation</strong><br>
              Spécifiez la matière, le niveau, la filière et les paramètres du devoir surveillé.
            </div>
            <div class="eval-save-load-controls" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
              <select class="field-input field-select" id="eval-saved-list" style="width:auto; padding:6px; font-size:12px; background:rgba(0,0,0,0.2)">
                <option value="">— Profils sauvegardés —</option>
              </select>
              <button class="btn-ghost" id="eval-load-btn" @click="handleLoadConfig" style="border:1px dashed rgba(255,255,255,0.2); font-size:12px; padding:6px 12px; background:rgba(0,0,0,0.2)">📂 Charger</button>
              <button class="btn-ghost" id="eval-delete-save-btn" @click="handleDeleteSave" style="border:1px dashed rgba(255,100,100,0.4); font-size:12px; padding:6px 12px; background:rgba(255,0,0,0.1); color:#ff6b6b">🗑️</button>
            </div>
          </div>

          <!-- Discipline -->
          <div class="field-group">
            <label class="field-label">📚 Discipline / Matière <span style="color:var(--danger)">*</span></label>
            <select class="field-input field-select" id="eval-discipline" @change="handleDisciplineChange">
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
          <div class="field-group" id="eval-custom-discipline-group" style="display:none">
            <label class="field-label">✏️ Nom de la discipline</label>
            <input type="text" class="field-input" id="eval-custom-discipline"
              placeholder="Ex : Chimie Organique, Droit, Comptabilité…">
          </div>

          <!-- Niveau & Filière/Option -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <!-- Niveau scolaire -->
            <div class="field-group">
              <label class="field-label">🎓 Niveau scolaire <span style="color:var(--danger)">*</span></label>
              <select class="field-input field-select" id="eval-niveau">
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

            <!-- Filière / Option -->
            <div class="field-group">
              <label class="field-label">🏫 Filière / Option</label>
              <input type="text" class="field-input" id="eval-filiere"
                placeholder="Ex : PC — Option Français, SP, Lettres…" value="PC — Option Français">
            </div>
          </div>

          <!-- Semestre & N° Devoir -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div class="field-group">
              <label class="field-label">📅 Semestre</label>
              <select class="field-input field-select" id="eval-semestre">
                <option value="1">Semestre 1</option>
                <option value="2" selected>Semestre 2</option>
              </select>
            </div>
            <div class="field-group">
              <label class="field-label">🔢 N° du Devoir Surveillé</label>
              <select class="field-input field-select" id="eval-num-devoir">
                <option value="1">Devoir N° 1</option>
                <option value="2" selected>Devoir N° 2</option>
                <option value="3">Devoir N° 3</option>
              </select>
            </div>
          </div>

          <!-- Langue de génération -->
          <div class="field-group" style="margin-top:12px">
            <label class="field-label">🌍 Langue de génération de l'évaluation</label>
            <select class="field-input field-select" id="eval-output-lang">
              <option value="fr" selected>🇫🇷 Français (par défaut)</option>
              <option value="en">🇬🇧 English</option>
              <option value="ar">🇲🇦 العربية (Arabe)</option>
            </select>
            <div class="field-hint" style="margin-top:4px;font-size:11px;color:var(--text-dim)">
              ℹ️ Détection automatique si la matière est « Arabe » ou « Anglais ».
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="close-evaluation-modal-step1" @click="handleClose">Annuler</button>
            <button class="btn-primary" id="eval-next-1" @click="handleNext1">Suivant →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 2 — Contenu du cours
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="eval-step-2" style="display:none">
          <div class="info-block" style="border-left-color:var(--cyan);margin-bottom:16px">
            <strong style="color:var(--cyan)">📖 Étape 2 / 3 — Contenu du cours à évaluer</strong><br>
            Collez le texte du cours ou importez un PDF. L'IA analysera toutes les notions clés et les répartira en deux groupes équilibrés.
          </div>

          <!-- Zone Cours -->
          <div class="field-group">
            <label class="field-label">📋 Contenu du cours <span style="color:var(--danger)">*</span></label>
            <textarea class="field-textarea" id="eval-cours" rows="12"
              placeholder="Collez ici le texte intégral du cours, de la leçon ou du chapitre à évaluer…

L'IA va :
1. Identifier toutes les notions clés
2. Les diviser en 2 groupes équilibrés (A et B)
3. Générer la Version A basée sur le Groupe A
4. Générer la Version B basée sur le Groupe B
5. Fournir les corrigés détaillés des deux versions"></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="eval-pdf-upload" class="eval-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer fichiers (PDF, image ou TXT — sélection multiple possible)
              </label>
              <input type="file" id="eval-pdf-upload" accept=".pdf,.txt,.md,image/*" multiple style="display:none">
              <span id="eval-pdf-badge" style="display:none;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#f59e0b"></span>
              <button id="eval-pdf-remove" class="file-remove-btn" title="Supprimer les fichiers" style="display:none">✕</button>
            </div>
            <div id="eval-pdf-info" style="display:none;margin-top:8px;padding:8px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;font-size:11px;color:#f59e0b">
              ✅ Fichier cours chargé en mémoire — Gemini Vision analysera le document nativement.
            </div>
          </div>

          <!-- Consignes supplémentaires (optionnel) -->
          <div class="field-group" style="margin-top:16px">
            <label class="field-label">⚙️ Consignes ou précisions supplémentaires <span style="font-weight:normal;color:var(--text-dim)">(Optionnel)</span></label>
            <textarea class="field-textarea" id="eval-consignes" rows="3"
              placeholder="Ex : Insistez sur les processus de la photosynthèse. Évitez les questions sur la mitose. Adaptez au niveau B1-B2 strict."></textarea>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="eval-back-2" @click="handleBack(1)">← Retour</button>
            <button class="btn-primary" id="eval-next-2" @click="handleNext2">Vérifier →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 3 — Résumé & Génération
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="eval-step-3" style="display:none">
          <div class="info-block" style="border-left-color:#34d399;margin-bottom:16px">
            <strong style="color:#34d399">🚀 Étape 3 / 3 — Prêt à générer</strong><br>
            Vérifiez le résumé ci-dessous avant de lancer la génération.
          </div>

          <!-- Résumé -->
          <div id="eval-summary" style="background:var(--void);border:1px solid var(--grid);border-radius:var(--r);padding:14px;font-size:12px;line-height:1.8;margin-bottom:16px">
            <!-- Rempli dynamiquement -->
          </div>

          <!-- Ce que va générer l'IA -->
          <div style="padding:12px 16px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:16px;font-size:12px">
            <div style="font-weight:700;color:#f59e0b;margin-bottom:8px">📋 L'IA va générer :</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="color:var(--text-dim)">
                <div style="color:#60a5fa;font-weight:600;margin-bottom:4px">📄 VERSION A</div>
                • I. Définitions (1 pt)<br>
                • II. QCM — 4 questions (1 pt)<br>
                • III. Association (1 pt)<br>
                • IV. Vrai ou Faux (1 pt)<br>
                • V. Texte à trous (1 pt)<br>
                <strong style="color:#60a5fa">Total : 5 points</strong>
              </div>
              <div style="color:var(--text-dim)">
                <div style="color:#a78bfa;font-weight:600;margin-bottom:4px">📄 VERSION B</div>
                • I. Définitions (1 pt)<br>
                • II. QCM — 4 questions (1 pt)<br>
                • III. Association (1 pt)<br>
                • IV. Vrai ou Faux (1 pt)<br>
                • V. Texte à trous (1 pt)<br>
                <strong style="color:#a78bfa">Total : 5 points</strong>
              </div>
            </div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);color:#34d399">
              + ✅ <strong>Corrigé détaillé Version A</strong> & <strong>Corrigé détaillé Version B</strong>
            </div>
          </div>

          <!-- Options export -->
          <div class="field-group" style="margin-bottom:12px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim)">
              <input type="checkbox" id="eval-export-word" style="accent-color:var(--neon)">
              <span>📄 Exporter automatiquement en Word (.doc) après génération</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="eval-export-html" checked style="accent-color:var(--neon)">
              <span>🌐 Exporter automatiquement en HTML (mise en page impression parfaite)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="eval-export-pdf" style="accent-color:var(--neon)">
              <span>📕 Exporter automatiquement en PDF</span>
            </label>
          </div>

          <!-- Info moteur IA -->
          <div id="eval-engine-gemini" style="font-size:11px;color:#34d399;margin-bottom:12px;padding:8px 12px;background:rgba(52,211,153,0.08);border-radius:6px;border:1px solid rgba(52,211,153,0.3)">
            ✨ <strong>Gemini Vision activé</strong> — Requis pour l'analyse approfondie du cours et la génération des deux évaluations complémentaires.
          </div>

          <div class="btn-row" style="flex-wrap: wrap;">
            <button class="btn-ghost" id="eval-back-3" @click="handleBack(2)">← Retour</button>
            <button class="btn-ghost" id="eval-save-btn" @click="handleSaveConfig" style="border:1px dashed var(--cyan); color:var(--cyan)">💾 Sauvegarder config</button>
            <button class="btn-primary" id="eval-generate-btn" @click="handleGenerate" style="background:linear-gradient(135deg,#f59e0b,#f97316);color:#000;font-weight:700;gap:8px">
              <span>📝</span> GÉNÉRER LES ÉVALUATIONS A/B
            </button>
          </div>
        </div>

      </div><!-- /modal-body -->
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  // Rien à faire au montage — la logique est dans legacy.js
});

// Appels aux fonctions globales exposées par legacy.js
const handleClose = () => window.closeEvaluationModal?.();
const handleBack = (step) => window.evalShowStep?.(step);

const handleNext1 = () => {
  if (!window.evalValidateStep1?.()) return;
  window.evalShowStep?.(2);
};

const handleNext2 = () => {
  if (!window.evalValidateStep2?.()) return;
  window.evalBuildSummary?.();
  window.evalShowStep?.(3);
};

const handleGenerate = () => {
  window.generateEvaluationSheet?.();
};

const handleSaveConfig = () => {
  document.dispatchEvent(new CustomEvent('do-save-eval-config'));
};

const handleLoadConfig = () => {
  document.dispatchEvent(new CustomEvent('do-load-eval-config'));
};

const handleDeleteSave = () => {
  document.dispatchEvent(new CustomEvent('do-delete-eval-config'));
};

// Auto-détection langue selon la discipline choisie
const handleDisciplineChange = (e) => {
  const langSel = document.getElementById('eval-output-lang');
  const customGroup = document.getElementById('eval-custom-discipline-group');
  if (langSel) {
    if (e.target.value === 'Arabe') langSel.value = 'ar';
    else if (e.target.value === 'Anglais') langSel.value = 'en';
    else langSel.value = 'fr';
  }
  if (customGroup) {
    customGroup.style.display = e.target.value === 'Autre' ? 'block' : 'none';
  }
};
</script>

<style scoped>
.eval-step-dot {
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
.eval-step-dot.active {
  border-color: #f59e0b;
  color: #f59e0b;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
}
.eval-step-dot.done {
  border-color: var(--cyan);
  background: rgba(0, 229, 255, 0.15);
  color: var(--cyan);
}
.eval-step-line {
  flex: 1;
  height: 2px;
  background: var(--grid);
  transition: background 0.3s;
}
.eval-step-line.done {
  background: var(--cyan);
}
.eval-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 4px 12px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 20px;
  font-size: 11px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.07);
  transition: background 0.2s, border-color 0.2s;
  user-select: none;
}
.eval-upload-btn:hover {
  background: rgba(245, 158, 11, 0.14);
  border-color: rgba(245, 158, 11, 0.6);
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
