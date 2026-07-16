<template>
  <!-- ═══════════════════ MODAL : FICHE DE CORRECTION ═══════════════════ -->
  <div class="modal-overlay" id="correction-modal">
    <div class="modal-box" style="max-width:680px;max-height:90vh;overflow-y:auto">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>

      <!-- ── Header ── -->
      <div class="modal-header">
        <div class="modal-title" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">📋</span>
          Générateur de Fiche de Correction
        </div>
        <button class="modal-close" id="close-correction-modal">✕</button>
      </div>

      <div class="modal-body">

        <!-- ── Progress bar ── -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:20px">
          <div class="corr-step-dot active" id="cdot-1">1</div>
          <div class="corr-step-line" id="cline-1"></div>
          <div class="corr-step-dot" id="cdot-2">2</div>
          <div class="corr-step-line" id="cline-2"></div>
          <div class="corr-step-dot" id="cdot-3">3</div>
          <div class="corr-step-line" id="cline-3"></div>
          <div class="corr-step-dot" id="cdot-4">4</div>
          <div style="margin-left:10px;font-size:11px;color:var(--text-dim)" id="corr-step-label">Contexte pédagogique</div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 1 — Contexte pédagogique
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="corr-step-1">
          <div class="info-block" style="border-left-color:var(--neon);margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="color:var(--neon)">🎯 Étape 1 / 4 — Contexte pédagogique</strong><br>
              Renseignez la discipline, le niveau et le type d'évaluation.
            </div>
            <div class="corr-save-load-controls" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
              <select class="field-input field-select" id="corr-saved-list" style="width:auto; padding:6px; font-size:12px; background:rgba(0,0,0,0.2)">
                <option value="">— Profils sauvegardés —</option>
              </select>
              <button class="btn-ghost" id="corr-load-btn" @click="handleLoadConfig" style="border:1px dashed rgba(255,255,255,0.2); font-size:12px; padding:6px 12px; background:rgba(0,0,0,0.2)">📂 Charger</button>
              <button class="btn-ghost" id="corr-delete-save-btn" @click="handleDeleteSave" style="border:1px dashed rgba(255,100,100,0.4); font-size:12px; padding:6px 12px; background:rgba(255,0,0,0.1); color:#ff6b6b">🗑️</button>
            </div>
          </div>

          <!-- Discipline -->
          <div class="field-group">
            <label class="field-label">📚 Discipline <span style="color:var(--danger)">*</span></label>
            <select class="field-input field-select" id="corr-discipline" @change="handleDisciplineChange">
              <option value="">— Choisir une discipline —</option>
              <optgroup label="Sciences">
                <option value="SVT">SVT (Sciences de la Vie et de la Terre)</option>
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
              <optgroup label="Sciences Humaines">
                <option value="Histoire-Géo">Histoire-Géographie</option>
                <option value="Économie">Économie / SES</option>
                <option value="Géographie">Géographie</option>
              </optgroup>
              <optgroup label="Autres">
                <option value="EPS">EPS</option>
                <option value="Arts">Arts plastiques / Musique</option>
                <option value="Autre">Autre discipline</option>
              </optgroup>
            </select>
          </div>

          <!-- Discipline personnalisée -->
          <div class="field-group" id="corr-custom-discipline-group" style="display:none">
            <label class="field-label">✏️ Nom de la discipline</label>
            <input type="text" class="field-input" id="corr-custom-discipline"
              placeholder="Ex : Chimie Organique, Droit, Comptabilité…">
          </div>

          <!-- Paramètres de classe -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <!-- Niveau scolaire -->
            <div class="field-group">
              <label class="field-label">🎓 Niveau scolaire <span style="color:var(--danger)">*</span></label>
              <select class="field-input field-select" id="corr-niveau">
                <option value="">— Choisir —</option>
                <optgroup label="Collège">
                  <option value="1ère Année Collège (1AC)">1ère Année Collège (1AC)</option>
                  <option value="2ème Année Collège (2AC)">2ème Année Collège (2AC)</option>
                  <option value="3ème Année Collège (3AC)">3ème Année Collège (3AC)</option>
                </optgroup>
                <optgroup label="Lycée">
                  <option value="Tronc Commun (TC)">Tronc Commun (TC)</option>
                  <option value="1ère Année Bac (1BAC)">1ère Année Bac (1BAC)</option>
                  <option value="2ème Année Bac (2BAC)">2ème Année Bac (2BAC)</option>
                </optgroup>
              </select>
            </div>

            <!-- Filière -->
            <div class="field-group">
              <label class="field-label">📚 Filière</label>
              <select class="field-input field-select" id="corr-filiere">
                <option value="Aucune (Collège)">Aucune (Collège)</option>
                <optgroup label="Tronc Commun">
                  <option value="TC Sciences">TC Sciences</option>
                  <option value="TC Lettres et Sciences Humaines">TC Lettres et Sciences Humaines</option>
                  <option value="TC Technologie">TC Technologie</option>
                  <option value="TC Enseignement Originel">TC Enseignement Originel</option>
                </optgroup>
                <optgroup label="1ère / 2ème Bac">
                  <option value="Sciences Physiques (SP)">Sciences Physiques (SP)</option>
                  <option value="Sciences Mathématiques (SM)">Sciences Mathématiques (SM)</option>
                  <option value="Sciences de la Vie et de la Terre (SVT)">Sciences de la Vie et de la Terre (SVT)</option>
                  <option value="Sciences Agronomiques">Sciences Agronomiques</option>
                  <option value="Sciences Économiques">Sciences Économiques</option>
                  <option value="Techniques de Gestion Comptable">Techniques de Gestion Comptable</option>
                  <option value="Lettres">Lettres</option>
                  <option value="Sciences Humaines">Sciences Humaines</option>
                  <option value="Sciences et Technologies">Sciences et Technologies</option>
                </optgroup>
              </select>
            </div>

            <!-- Option -->
            <div class="field-group">
              <label class="field-label">🌍 Option (Langue)</label>
              <select class="field-input field-select" id="corr-option">
                <option value="Générale (Arabe)">Générale (Arabe)</option>
                <option value="Section Internationale - Français (BIOF)">Section Internationale - Français (BIOF)</option>
                <option value="Section Internationale - Anglais">Section Internationale - Anglais</option>
                <option value="Section Internationale - Espagnol">Section Internationale - Espagnol</option>
              </select>
            </div>

            <!-- Type d'évaluation -->
            <div class="field-group">
              <label class="field-label">📝 Type d'évaluation <span style="color:var(--danger)">*</span></label>
              <select class="field-input field-select" id="corr-type-eval">
                <option value="Contrôle continu">Contrôle continu (CC)</option>
                <option value="Devoir surveillé">Devoir surveillé (DS)</option>
                <option value="Devoir maison">Devoir maison (DM)</option>
                <option value="Bac blanc">Bac blanc</option>
                <option value="Examen national">Examen national (Bac)</option>
                <option value="Interrogation rapide">Interrogation rapide</option>
              </select>
            </div>
          </div>

          <!-- Niveau de langue (conditionnel) -->
          <div class="field-group" id="corr-langue-group" style="display:none">
            <label class="field-label">🗣️ Niveau de langue cible</label>
            <select class="field-input field-select" id="corr-niveau-langue">
              <option value="">— Optionnel —</option>
              <option value="A1">A1 — Débutant</option>
              <option value="A2">A2 — Élémentaire</option>
              <option value="B1">B1 — Intermédiaire</option>
              <option value="B2">B2 — Avancé</option>
              <option value="C1">C1 — Autonome</option>
              <option value="C2">C2 — Maîtrise</option>
              <option value="Natif">Natif</option>
            </select>
          </div>

          <!-- Langue de génération de la fiche -->
          <div class="field-group" style="margin-top:12px">
            <label class="field-label">🌍 Langue de génération de la fiche</label>
            <select class="field-input field-select" id="corr-output-lang">
              <option value="fr" selected>🇫🇷 Français (par défaut)</option>
              <option value="en">🇬🇧 English</option>
              <option value="ar">🇲🇦 العربية (Arabe)</option>
            </select>
            <div class="field-hint" style="margin-top:4px;font-size:11px;color:var(--text-dim)">
              ℹ️ Détection automatique si la matière est « Arabe » ou « Anglais ».
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="close-correction-modal-step1" @click="handleClose">Annuler</button>
            <button class="btn-primary" id="corr-next-1" @click="handleNext1">Suivant →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 2 — Sujet & Barème
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="corr-step-2" style="display:none">
          <div class="info-block" style="border-left-color:var(--cyan);margin-bottom:16px">
            <strong style="color:var(--cyan)">📄 Étape 2 / 4 — Sujet & Barème</strong><br>
            Collez votre sujet complet ci-dessous. Indiquez le barème si disponible.
          </div>

          <!-- Zone sujet -->
          <div class="field-group">
            <label class="field-label">📋 Sujet complet <span style="color:var(--danger)">*</span></label>
            <textarea class="field-textarea" id="corr-sujet" rows="8"
              placeholder="Collez ici le texte complet de votre exercice ou contrôle…&#10;&#10;Exemple :&#10;Question 1 (4 pts) : Décrivez les étapes de la respiration cellulaire.&#10;Question 2 (6 pts) : À partir du document 1, proposez deux hypothèses…&#10;&#10;Conseil : Plus le sujet est complet, plus la fiche sera précise."></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="corr-pdf-upload" class="corr-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer un fichier (PDF, image ou TXT)
              </label>
              <input type="file" id="corr-pdf-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="corr-pdf-badge" style="display:none;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#a78bfa"></span>
              <button id="corr-pdf-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="corr-pdf-info" style="display:none;margin-top:8px;padding:8px 12px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:6px;font-size:11px;color:#a78bfa">
              ✅ Texte extrait du PDF et collé dans la zone ci-dessus. Vous pouvez le modifier avant de passer à l'étape suivante.
            </div>
          </div>

          <!-- Barème -->
          <div class="field-group">
            <label class="field-label">⚖️ Barème détaillé</label>
            <textarea class="field-textarea" id="corr-bareme" rows="4"
              placeholder="Exemples :&#10;Q1 : 4 pts (description 2pts + analyse 2pts)&#10;Q2 : 6 pts (hypothèse 1 : 3pts / hypothèse 2 : 3pts)&#10;&#10;Laissez vide → l'IA créera des espaces [À définir]"></textarea>
            <div class="field-hint">Si le barème est absent, l'IA générera la structure et signalera les zones à compléter.</div>
          </div>

          <!-- Format de sortie -->
          <div class="field-group">
            <label class="field-label">🗂️ Format de sortie souhaité</label>
            <select class="field-input field-select" id="corr-format">
              <option value="Tableau 4 colonnes (Numéro, Réponse attendue, Critères+Barème, Compétence) + Conseils pédagogiques">📊 Tableau 4 colonnes + Conseils (défaut)</option>
              <option value="Texte structuré par question avec sous-sections (réponse, barème, compétence) sans tableau">📝 Texte structuré (sans tableau)</option>
              <option value="Grille de compétences avec indicateurs de réussite par niveau (insuffisant, en cours, acquis, dépassé)">🏅 Grille de compétences avec niveaux</option>
              <option value="Fiche courte : réponses synthétiques + points clés uniquement, sans conseils">⚡ Fiche courte (réponses synthétiques)</option>
            </select>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="corr-back-2" @click="handleBack(1)">← Retour</button>
            <button class="btn-primary" id="corr-next-2" @click="handleNext2">Suivant →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 3 — Compétences & Options
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="corr-step-3" style="display:none">
          <div class="info-block" style="border-left-color:#a78bfa;margin-bottom:16px">
            <strong style="color:#a78bfa">🧠 Étape 3 / 4 — Compétences & Options</strong><br>
            Les compétences sont pré-remplies selon votre discipline. Modifiez-les si besoin.
          </div>

          <!-- Compétences -->
          <div class="field-group">
            <label class="field-label">🎯 Référentiel de compétences évaluées</label>
            <textarea class="field-textarea" id="corr-competences" rows="4"
              placeholder="Pré-remplies automatiquement selon la discipline choisie…"></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
              <label for="corr-ref-upload" class="corr-upload-btn">
                <span style="font-size:13px">📎</span>
                Importer un Cadre de Référence (PDF/Image/TXT)
              </label>
              <input type="file" id="corr-ref-upload" accept=".pdf,.txt,.md,image/*" style="display:none">
              <span id="corr-ref-badge" style="display:none;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#a78bfa"></span>
              <button id="corr-ref-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
              <span style="color:var(--text-dim)">Ces compétences alimenteront la 4ème colonne du tableau.</span>
            </div>
          </div>

          <!-- Critères personnalisés -->
          <div class="field-group">
            <label class="field-label">✅ Critères d'évaluation personnalisés</label>
            <input type="text" class="field-input" id="corr-criteres"
              placeholder="Ex : Qualité rédaction, Schéma obligatoire, Orthographe pénalisée…">
          </div>

          <!-- Consignes supplémentaires -->
          <div class="field-group">
            <label class="field-label">💬 Consignes supplémentaires à l'IA</label>
            <textarea class="field-textarea" id="corr-consignes" rows="3"
              placeholder="Ex : Réponses très courtes pour Q1 / Valoriser les schémas-blocs / Ne pas pénaliser l'orthographe / Indiquer les erreurs classiques attendues…"></textarea>
          </div>

          <!-- Exemple modèle (optionnel) -->
          <div class="field-group">
            <label class="field-label">📎 Exemple de correction modèle <span style="font-weight:normal;color:var(--text-dim)">(Few-Shot, Optionnel)</span></label>
            <textarea class="field-textarea" id="corr-exemple" rows="3"
              placeholder="Collez une ancienne fiche de correction pour guider le style et le niveau de détail, ou importez-en une depuis un fichier."></textarea>
            <div class="field-hint" style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
              <label for="corr-exemple-upload" class="corr-upload-btn" style="border-color:rgba(245,158,11,0.5);color:#f59e0b;background:rgba(245,158,11,0.07)">
                <span style="font-size:13px">📄</span>
                Importer une fiche modèle (PDF / Image / TXT)
              </label>
              <input type="file" id="corr-exemple-upload" accept=".pdf,.txt,.md,.doc,.docx,image/*" style="display:none">
              <span id="corr-exemple-badge" style="display:none;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:2px 10px;font-size:11px;color:#f59e0b"></span>
              <button id="corr-exemple-remove" class="file-remove-btn" title="Supprimer ce fichier" style="display:none">✕</button>
            </div>
            <div id="corr-exemple-info" style="display:none;margin-top:6px;padding:8px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:6px;font-size:11px;color:#f59e0b">
              ✅ Fiche modèle importée — l'IA l'utilisera comme référence absolue pour la mise en forme.
            </div>
          </div>

          <div class="btn-row">
            <button class="btn-ghost" id="corr-back-3" @click="handleBack(2)">← Retour</button>
            <button class="btn-primary" id="corr-next-3" @click="handleNext3">Vérifier →</button>
          </div>
        </div>

        <!-- ══════════════════════════════════════════
             ÉTAPE 4 — Résumé & Génération
        ══════════════════════════════════════════ -->
        <div class="corr-step" id="corr-step-4" style="display:none">
          <div class="info-block" style="border-left-color:#f59e0b;margin-bottom:16px">
            <strong style="color:#f59e0b">🚀 Étape 4 / 4 — Prêt à générer</strong><br>
            Vérifiez le résumé ci-dessous avant de lancer la génération.
          </div>

          <!-- Résumé -->
          <div id="corr-summary" style="background:var(--void);border:1px solid var(--grid);border-radius:var(--r);padding:14px;font-size:12px;line-height:1.8;margin-bottom:16px">
            <!-- Rempli dynamiquement -->
          </div>

          <!-- Option export Word -->
          <div class="field-group" style="margin-bottom:12px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim)">
              <input type="checkbox" id="corr-export-word" style="accent-color:var(--neon)">
              <span>📄 Exporter automatiquement en Word (.doc) après génération</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="corr-export-html" style="accent-color:var(--neon)">
              <span>🌐 Exporter automatiquement en HTML (Idéal pour les formules scientifiques)</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-dim);margin-top:6px">
              <input type="checkbox" id="corr-export-pdf" style="accent-color:var(--neon)">
              <span>📕 Exporter automatiquement en PDF (Rendu parfait)</span>
            </label>
          </div>

          <!-- Info moteur IA utilisé -->
          <div id="corr-engine-gemini" style="display:none;font-size:11px;color:#34d399;margin-bottom:12px;padding:8px 12px;background:rgba(52,211,153,0.08);border-radius:6px;border:1px solid rgba(52,211,153,0.3)">
            ✨ <strong>Gemini 2.5 Flash activé</strong> — Le PDF sera envoyé en vision native.<br>
            Gemini lira directement vos graphiques, schémas et tableaux sans OCR.
          </div>
          <div id="corr-engine-mistral" style="font-size:11px;color:var(--text-dim);margin-bottom:12px;padding:8px;background:rgba(0,229,255,0.05);border-radius:6px;border:1px solid rgba(0,229,255,0.1)">
            💡 La fiche sera générée <strong style="color:var(--cyan)">directement dans le chat</strong> en streaming (Mistral).<br>
            Pour utiliser Gemini Vision sur vos PDFs avec graphiques, ajoutez votre clé Google AI dans Paramètres API.
          </div>

          <div class="btn-row" style="flex-wrap: wrap;">
            <button class="btn-ghost" id="corr-back-4" @click="handleBack(3)">← Retour</button>
            <button class="btn-ghost" id="corr-save-btn" @click="handleSaveConfig" style="border:1px dashed var(--cyan); color:var(--cyan)">💾 Sauvegarder config</button>
            <button class="btn-primary" id="corr-generate-btn" @click="handleGenerate" style="background:linear-gradient(135deg,var(--neon),var(--cyan));color:#000;font-weight:700;gap:8px">
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

// Appel des fonctions globales exposées par legacy.js (via window)
// Ces fonctions sont toujours disponibles au moment où les boutons sont cliqués
const handleClose = () => window.closeCorrectionModal?.();
const handleBack = (step) => window.corrShowStep?.(step);

const handleNext1 = () => {
  if (!window.corrValidateStep1?.()) return;
  window.corrFillCompetences?.();
  window.corrShowStep?.(2);
};

const handleNext2 = () => {
  if (!window.corrValidateStep2?.()) return;
  window.corrShowStep?.(3);
};

const handleNext3 = () => {
  window.corrBuildSummary?.();
  window.corrShowStep?.(4);
};

const handleGenerate = () => {
  window.generateCorrectionSheet?.();
};
const handleSaveConfig = () => {
  document.dispatchEvent(new CustomEvent('do-save-correction-config'));
};
const handleLoadConfig = () => {
  document.dispatchEvent(new CustomEvent('do-load-correction-config'));
};
const handleDeleteSave = () => {
  document.dispatchEvent(new CustomEvent('do-delete-correction-config'));
};

// Auto-détection langue selon la discipline choisie
const handleDisciplineChange = (e) => {
  const langSel = document.getElementById('corr-output-lang');
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
