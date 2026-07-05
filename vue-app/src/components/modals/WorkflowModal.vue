<template>
  <!-- ═══════════════════ MODAL : WORKFLOW CREATOR ═══════════════════ -->
  <div class="modal-overlay" id="workflow-modal">
    <div class="modal-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_wf_title') }}</div>
        <button class="modal-close" id="close-workflow-modal">{{ t('btn_close_x') }}</button>
      </div>
      <div class="modal-body">

        <!-- EXPLICATION -->
        <div class="info-block" style="border-left-color:var(--neon)">
          <strong style="color:var(--neon)">{{ t('mdl_wf_what_is') }}</strong><br>
          Une chaîne connecte plusieurs agents en séquence. La sortie de chaque agent est transmise à l'agent suivant.
          <span v-html="t('mdl_wf_desc')"></span><br><br>
          <strong style="color:var(--cyan);font-size:10px">{{ t('mdl_wf_tip') }}</strong><br>
          <span style="font-size:11px">Si la réponse d'un agent contient <code
              style="color:var(--neon)">[GOTO:3]</code>, la chaîne sautera directement à l'étape 3. Si elle contient
            <code style="color:var(--danger)">[STOP]</code>, la chaîne s'arrêtera immédiatement.</span>
        </div>

        <!-- WORKFLOWS EXISTANTS -->
        <div id="wf-existing-list" class="wf-existing-list"></div>

        <div class="section-title">{{ t('mdl_wf_create') }}</div>

        <!-- NOM -->
        <div class="field-group">
          <label class="field-label">Nom de la chaîne <span style="color:var(--danger)">*</span></label>
          <input type="text" class="field-input" id="wf-name"
            placeholder="Ex : Rédaction Article Complet, Pipeline SEO…">
        </div>

        <!-- DESCRIPTION -->
        <div class="field-group">
          <label class="field-label">{{ t('lbl_wf_desc') }}</label>
          <input type="text" class="field-input" id="wf-desc"
            placeholder="Ex : Recherche → Plan → Rédaction → Correction">
        </div>

        <!-- ÉTAPES -->
        <div class="field-group">
          <label class="field-label">{{ t('lbl_wf_steps') }}</label>
          <div class="wf-steps-zone" id="wf-steps-zone">
            <div class="wf-steps-empty">Aucune étape — cliquez sur "+ AJOUTER" ci-dessous</div>
          </div>
          <button type="button" class="wf-add-step-btn" id="wf-add-step">{{ t('btn_wf_add_step') }}</button>
        </div>

        <input type="hidden" id="wf-edit-id">

        <div class="btn-row">
          <button class="btn-ghost" id="close-workflow-modal-2">{{ t('btn_cancel') }}</button>
          <button class="btn-ghost danger" id="wf-delete-btn"
            style="display:none;border-color:rgba(255,51,102,0.3);color:var(--danger)">🗑 SUPPRIMER</button>
          <button class="btn-primary" id="wf-save-btn">{{ t('btn_wf_save') }}</button>
        </div>

        <hr style="border:none;border-top:1px solid var(--grid);margin:20px 0">

        <!-- EXPORT / IMPORT WORKFLOWS -->
        <div class="section-title">{{ t('lbl_export_import') }}</div>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;line-height:1.6">Sauvegardez vos chaînes pour
          les partager ou les restaurer plus tard.</p>

        <button class="btn-ghost" id="btn-wf-export"
          style="width:100%;justify-content:center;display:flex;gap:8px;align-items:center;margin-bottom:12px">
          ⬇ EXPORTER TOUTES LES CHAÎNES
        </button>

        <div class="export-zone" id="wf-import-drop-zone">
          <div class="export-zone-icon">⬆</div>
          <div class="export-zone-text">
            <strong id="wf-import-zone-label">Glissez votre fichier de chaînes ici</strong>
            ou cliquez pour sélectionner (.json)
          </div>
        </div>
        <input type="file" id="wf-import-file-input" accept=".json" style="display:none">
      </div>
    </div>
  </div>

  <div id="toast-container"></div>

  </template>

<script setup>
import { t } from '../../i18n.js';
</script>
