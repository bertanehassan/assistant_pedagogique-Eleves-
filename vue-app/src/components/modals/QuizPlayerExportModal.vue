<template>
  <!-- ═══════════════════ MODAL : QUIZ PLAYER EXPORT ═══════════════════ -->
  <div class="modal-overlay" id="quiz-player-modal">
    <div class="modal-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">📋 {{ t('qp_modal_title') }}</div>
        <button class="modal-close" onclick="document.getElementById('quiz-player-modal').classList.remove('active')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="qp-msg-id">
        
        <div class="info-block" style="border-left-color:var(--neon)">
          Configurez les métadonnées de votre QCM avant de générer le fichier JSON compatible avec le Quiz Player.
        </div>

        <div class="field-group">
          <label class="field-label">{{ t('qp_title') }}</label>
          <input type="text" class="field-input" id="qp-titre" :placeholder="t('qp_title')">
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field-group">
            <label class="field-label">Matière</label>
            <input type="text" class="field-input" id="qp-matiere" value="SVT" placeholder="ex: SVT">
          </div>
          <div class="field-group">
            <label class="field-label">Leçon / Chapitre</label>
            <input type="text" class="field-input" id="qp-lecon" value="" placeholder="ex: Chapitre 1">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px">
          <div class="field-group">
            <label class="field-label">{{ t('qp_author') }}</label>
            <input type="text" class="field-input" id="qp-auteur" value="Hassan Bertane">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
          <div class="field-group" style="display:flex;align-items:center;gap:10px;margin-top:20px">
            <input type="checkbox" id="qp-eval" style="accent-color:var(--neon);width:16px;height:16px">
            <label class="field-label" style="margin-bottom:0">Mode Évaluation (anti-triche)</label>
          </div>
          <div class="field-group" id="qp-timer-group" style="display:none">
            <label class="field-label">Temps / question (sec)</label>
            <input type="number" class="field-input" id="qp-timer" value="30">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field-group" style="display:flex;align-items:center;gap:10px;margin-top:20px">
            <label class="field-label" style="margin-bottom:0">{{ t('qp_class') }}</label>
            <input type="text" class="field-input" id="qp-classe" value="3ème" style="width:100px;text-align:center">
          </div>
        </div>

        <div class="btn-row" style="margin-top:24px">
          <button class="btn-ghost" onclick="document.getElementById('quiz-player-modal').classList.remove('active')">{{ t('btn_cancel') }}</button>
          <button class="btn-primary" id="qp-export-btn">{{ t('qp_export_btn') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
