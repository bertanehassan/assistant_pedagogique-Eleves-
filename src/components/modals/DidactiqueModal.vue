<template>
  <!-- ═══════════════════ MODAL : FICHE DIDACTIQUE ═══════════════════ -->
  <div class="modal-overlay" id="didactique-modal">
    <div class="modal-box" style="max-width:680px;max-height:90vh;overflow-y:auto">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>

      <!-- ── Header ── -->
      <div class="modal-header">
        <div class="modal-title" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">👨‍🏫</span>
          Générateur de Fiche Didactique
        </div>
        <button class="modal-close" id="close-didactique-modal">✕</button>
      </div>

      <div class="modal-body">

        <!-- ── Progress bar ── -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:20px">
          <div class="corr-step-dot active" id="ddot-1">1</div>
          <div class="corr-step-line" id="dline-1"></div>
          <div class="corr-step-dot" id="ddot-2">2</div>
          <div class="corr-step-line" id="dline-2"></div>
          <div class="corr-step-dot" id="ddot-3">3</div>
          <div class="corr-step-line" id="dline-3"></div>
          <div class="corr-step-dot" id="ddot-4">4</div>
          <div style="margin-left:10px;font-size:11px;color:var(--text-dim)" id="didac-step-label">Contexte pédagogique</div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 1 — Contexte pédagogique
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="didac-step-1">
          <div class="info-block" style="border-left-color:var(--neon);margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="color:var(--neon)">🎯 Étape 1 / 4 — Contexte pédagogique</strong><br>
              Renseignez la discipline et le niveau. (Optimisé pour SVT 2BAC BIOF).
            </div>
            <div class="corr-save-load-controls" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
              <select class="field-input field-select" id="didac-saved-list" style="width:auto; padding:6px; font-size:12px; background:rgba(0,0,0,0.2)">
                <option value="">— Profils sauvegardés —</option>
              </select>
              <button class="btn-ghost" id="didac-load-btn" @click="handleLoadConfig" style="border:1px dashed rgba(255,255,255,0.2); font-size:12px; padding:6px 12px; background:rgba(0,0,0,0.2)">📂 Charger</button>
              <button class="btn-ghost" id="didac-delete-save-btn" @click="handleDeleteSave" style="border:1px dashed rgba(255,100,100,0.4); font-size:12px; padding:6px 12px; background:rgba(255,0,0,0.1); color:#ff6b6b">🗑️</button>
            </div>
          </div>

          <!-- Discipline -->
          <div class="field-group">
            <label class="field-label">📚 Discipline <span style="color:var(--danger)">*</span></label>
            <select class="field-input field-select" id="didac-discipline" @change="handleDisciplineChange">
              <option value="SVT" selected>SVT (Sciences de la Vie et de la Terre)</option>
              <option value="Physique-Chimie">Physique-Chimie</option>
              <option value="Maths">Mathématiques</option>
              <option value="Informatique">Informatique / NSI</option>
              <option value="Français">Français / Littérature</option>
              <option value="Anglais">Anglais (English)</option>
              <option value="Arabe">اللغة العربية (Arabe)</option>
              <option value="Autre">Autre discipline</option>
            </select>
          </div>

          <!-- Discipline personnalisée -->
          <div class="field-group" id="didac-custom-discipline-group" style="display:none">
            <label class="field-label">✏️ Nom de la discipline</label>
            <input type="text" class="field-input" id="didac-custom-discipline"
              placeholder="Ex : Chimie Organique, Droit, Comptabilité…">
          </div>

          <!-- Paramètres de classe -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <!-- Niveau scolaire -->
            <div class="field-group">
              <label class="field-label">🎓 Niveau scolaire <span style="color:var(--danger)">*</span></label>
              <select class="field-input field-select" id="didac-niveau">
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

            <!-- Filière -->
            <div class="field-group">
              <label class="field-label">📚 Filière</label>
              <select class="field-input field-select" id="didac-filiere">
                <option value="Sciences Physiques (SP)" selected>Sciences Physiques (SP)</option>
                <option value="Sciences Mathématiques (SM)">Sciences Mathématiques (SM)</option>
                <option value="Sciences de la Vie et de la Terre (SVT)">Sciences de la Vie et de la Terre (SVT)</option>
                <option value="Aucune (Collège)">Aucune (Collège)</option>
                <option value="Autre">Autre</option>
              </select>
            </div>

            <!-- Option -->
            <div class="field-group">
              <label class="field-label">🌍 Option (Langue)</label>
              <select class="field-input field-select" id="didac-option">
                <option value="Section Internationale - Français (BIOF)" selected>Section Internationale - Français (BIOF)</option>
                <option value="Générale (Arabe)">Générale (Arabe)</option>
                <option value="Section Internationale - Anglais">Section Internationale - Anglais</option>
                <option value="Section Internationale - Espagnol">Section Internationale - Espagnol</option>
              </select>
            </div>
          </div>

          <!-- Langue de génération de la fiche -->
          <div class="field-group" style="margin-top:12px">
            <label class="field-label">🌍 Langue de génération de la fiche</label>
            <select class="field-input field-select" id="didac-output-lang">
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
            <select class="field-input field-select" id="didac-model-select">
              <option value="gemini-3.5-flash" selected>✨ Gemini 3.5 Flash — Vision & PDF (par défaut)</option>
            </select>
            <div class="field-hint" style="margin-top:4px;font-size:11px;color:var(--text-dim)">
              ✨ Gemini 3.5 Flash recommandé pour lire les PDF natifs (graphiques inclus). Les autres modèles liront le texte extrait du PDF.
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="close-didactique-modal-step1" @click="handleClose">Annuler</button>
            <button class="btn-primary" id="didac-next-1" @click="handleNext1">Suivant →</button>
          </div>
        </div>


        <!-- ══════════════════════════════════════════
             ÉTAPE 2 — Support de cours
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="didac-step-2" style="display:none">
          <div class="info-block" style="border-left-color:var(--cyan);margin-bottom:16px">
            <strong style="color:var(--cyan)">📄 Étape 2 / 4 — Support de cours / Activité</strong><br>
            Collez le contenu de la leçon, de l'activité pédagogique, ou importez un PDF.
          </div>

          <!-- Zone cours -->
          <div class="field-group">
            <label class="field-label">📋 Contenu de la séquence <span style="color:var(--danger)">*</span></label>
            <textarea class="field-textarea" id="didac-cours" rows="10"
              placeholder="Collez ici le texte complet de votre cours, ou de l'activité pédagogique…"></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="didac-pdf-upload" class="corr-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer un fichier (PDF, image ou TXT)
              </label>
              <input type="file" id="didac-pdf-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="didac-pdf-badge" style="display:none;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#a78bfa"></span>
              <button id="didac-pdf-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="didac-pdf-info" style="display:none;margin-top:8px;padding:8px 12px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:6px;font-size:11px;color:#a78bfa">
              ✅ Fichier importé.
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="didac-back-2" @click="handleBack(1)">← Retour</button>
            <button class="btn-primary" id="didac-next-2" @click="handleNext2">Suivant →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 3 — Objectifs & Exemples
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="didac-step-3" style="display:none">
          <div class="info-block" style="border-left-color:#a78bfa;margin-bottom:16px">
            <strong style="color:#a78bfa">🧠 Étape 3 / 4 — Objectifs & Cadre</strong><br>
            Définissez les objectifs pédagogiques et les compétences ciblées pour cette séquence.
          </div>

          <!-- Objectifs Notionnels & Opérationnels -->
          <div class="field-group">
            <label class="field-label">🎯 Objectifs (Notionnels, Opérationnels) & Compétences</label>
            <textarea class="field-textarea" id="didac-objectifs" rows="4"
              placeholder="Ex : &#10;- Définir la mitose.&#10;- Analyser un caryotype.&#10;- Compétence de communication scientifique..."></textarea>
            
            <!-- Import Cadre de référence (comme pour la correction) -->
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="didac-ref-upload" class="corr-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer un Cadre de Référence (PDF/Image/TXT)
              </label>
              <input type="file" id="didac-ref-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="didac-ref-badge" style="display:none;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#a78bfa"></span>
              <button id="didac-ref-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
          </div>

          <!-- Exemple de fiche (Few-shot) -->
          <div class="field-group" style="margin-top: 16px;">
            <label class="field-label">📎 Exemple de fiche réussie <span style="font-weight:normal;color:var(--text-dim)">(Few-Shot, Optionnel)</span></label>
            <textarea class="field-textarea" id="didac-exemple" rows="4"
              placeholder="Collez ici une fiche didactique validée, ou importez-en une depuis un fichier. L'IA imitera son style, sa structure et son niveau de détail."></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
              <label for="didac-exemple-upload" class="corr-upload-btn" style="border-color:rgba(245,158,11,0.5);color:#f59e0b;background:rgba(245,158,11,0.07)">
                <span style="font-size:13px">📄</span>
                Importer une fiche exemple (PDF / Image / TXT)
              </label>
              <input type="file" id="didac-exemple-upload" accept=".pdf,.txt,.md,.doc,.docx,image/*" style="display:none">
              <span id="didac-exemple-badge" style="display:none;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#f59e0b"></span>
              <button id="didac-exemple-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="didac-exemple-info" style="display:none;margin-top:6px;padding:8px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:6px;font-size:11px;color:#f59e0b">
              ✅ Fiche exemple importée — l'IA l'utilisera comme modèle de style et de structure.
            </div>
            <div class="field-hint" style="margin-top:4px">Fournir un exemple améliore grandement la qualité du tableau généré.</div>
          </div>


          <!-- Directives pédagogiques & didactiques spécifiques -->
          <div class="field-group" style="margin-top:16px; border:1px solid rgba(52,211,153,0.25); border-radius:8px; padding:14px; background:rgba(52,211,153,0.04);">
            <label class="field-label" style="color:#34d399">
              📐 Directives pédagogiques & didactiques spécifiques
              <span style="font-weight:normal;color:var(--text-dim);font-size:11px"> (Optionnel — fortement recommandé)</span>
            </label>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;line-height:1.6">
              Saisissez ou importez les instructions officielles, les approches pédagogiques imposées,
              les démarches d'investigation, les contraintes institutionnelles ou tout autre directive
              spécifique à votre matière. L'IA les intègrera comme contraintes prioritaires dans la fiche.
            </div>
            <textarea class="field-textarea" id="didac-directives" rows="4"
              style="border-color:rgba(52,211,153,0.3); background:rgba(52,211,153,0.03)"
              placeholder="Ex :&#10;- Utiliser obligatoirement la démarche d'investigation (observation → hypothèse → expérience → conclusion).&#10;- Respecter l'approche par compétences (APC) du programme officiel marocain.&#10;- Privilégier le travail en binôme pour les activités documentaires.&#10;- Toujours partir du concret vers l'abstrait (inductif).&#10;- La langue d'enseignement est le français (niveau B1/B2 maximum)."></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
              <label for="didac-directives-upload" class="corr-upload-btn" style="border-color:rgba(52,211,153,0.5);color:#34d399;background:rgba(52,211,153,0.07)">
                <span style="font-size:13px">📐</span>
                Importer des directives (PDF / Image / TXT)
              </label>
              <input type="file" id="didac-directives-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="didac-directives-badge" style="display:none;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#34d399"></span>
              <button id="didac-directives-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="didac-directives-info" style="display:none;margin-top:6px;padding:8px 12px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:6px;font-size:11px;color:#34d399">
              ✅ Directives importées — l'IA les appliquera comme contraintes prioritaires dans toute la fiche.
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="didac-back-3" @click="handleBack(2)">← Retour</button>
            <button class="btn-primary" id="didac-next-3" @click="handleNext3">Vérifier →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 4 — Résumé & Génération
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="didac-step-4" style="display:none">
          <div class="info-block" style="border-left-color:#f59e0b;margin-bottom:16px">
            <strong style="color:#f59e0b">🚀 Étape 4 / 4 — Prêt à générer</strong><br>
            Vérifiez le résumé ci-dessous avant de lancer la génération.
          </div>

          <!-- Résumé -->
          <div id="didac-summary" style="background:var(--void);border:1px solid var(--grid);border-radius:var(--r);padding:14px;font-size:12px;line-height:1.8;margin-bottom:16px">
            <!-- Rempli dynamiquement -->
          </div>

          <!-- Option export Word -->
          <div class="field-group" style="margin-bottom:12px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim)">
              <input type="checkbox" id="didac-export-word" style="accent-color:var(--neon)">
              <span>📄 Exporter automatiquement en Word (.doc) après génération</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="didac-export-html" style="accent-color:var(--neon)">
              <span>🌐 Exporter automatiquement en HTML (Idéal pour les formules scientifiques)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="didac-export-pdf" style="accent-color:var(--neon)">
              <span>📕 Exporter automatiquement en PDF (Rendu parfait)</span>
            </label>
          </div>

          <!-- Info moteur IA utilisé -->
          <div id="didac-engine-gemini" style="font-size:11px;color:#34d399;margin-bottom:12px;padding:8px 12px;background:rgba(52,211,153,0.08);border-radius:6px;border:1px solid rgba(52,211,153,0.3)">
            ✨ <strong>Gemini 2.5 Flash / Pro activé</strong> — Requis pour cette tâche complexe de génération de tableau Markdown.<br>
          </div>

          <div class="btn-row" style="flex-wrap: wrap;">
            <button class="btn-ghost" id="didac-back-4" @click="handleBack(3)">← Retour</button>
            <button class="btn-ghost" id="didac-save-btn" @click="handleSaveConfig" style="border:1px dashed var(--cyan); color:var(--cyan)">💾 Sauvegarder config</button>
            <button class="btn-primary" id="didac-generate-btn" @click="handleGenerate" style="background:linear-gradient(135deg,var(--neon),var(--cyan));color:#000;font-weight:700;gap:8px">
              <span>🎯</span> GÉNÉRER LA FICHE
            </button>
          </div>
        </div>

      </div><!-- /modal-body -->
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';

// Appel des fonctions globales exposées par legacy.js
const handleClose = () => window.closeDidactiqueModal?.();
const handleBack = (step) => window.didactiqueShowStep?.(step);

const handleNext1 = () => {
  if (!window.didactiqueValidateStep1?.()) return;
  window.didactiqueShowStep?.(2);
};

const handleNext2 = () => {
  if (!window.didactiqueValidateStep2?.()) return;
  window.didactiqueShowStep?.(3);
};

const handleNext3 = () => {
  window.didactiqueBuildSummary?.();
  window.didactiqueShowStep?.(4);
};

const handleGenerate = () => {
  window.generateDidactiqueSheet?.();
};
const handleSaveConfig = () => {
  document.dispatchEvent(new CustomEvent('do-save-didactique-config'));
};
const handleLoadConfig = () => {
  document.dispatchEvent(new CustomEvent('do-load-didactique-config'));
};
const handleDeleteSave = () => {
  document.dispatchEvent(new CustomEvent('do-delete-didactique-config'));
};

// Auto-détection langue selon la discipline choisie
const handleDisciplineChange = (e) => {
  const langSel = document.getElementById('didac-output-lang');
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
