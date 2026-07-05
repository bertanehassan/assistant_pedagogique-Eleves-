<template>
  <!-- ═══════════════════ MODAL : FEEDBACK APPRENTISSAGE ═══════════════════ -->
  <div class="modal-overlay" id="feedback-modal">
    <div class="modal-box" style="max-width:520px">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_feedback_title') }}</div>
        <button class="modal-close"
          onclick="document.getElementById('feedback-modal').classList.remove('active')">{{ t('btn_close_x') }}</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="feedback-msg-ts">
        <input type="hidden" id="feedback-score">

        <div style="text-align:center;margin-bottom:16px">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-bottom:4px">{{ t('mdl_feedback_lbl_score') }}</div>
          <span id="feedback-score-display" class="feedback-score-val bad">1/5</span>
        </div>

        <div class="info-block"
          style="margin-bottom:16px;border-color:rgba(255,51,102,0.3);background:rgba(255,51,102,0.05)">
          <strong>{{ t('mdl_feedback_lbl_wrong') }}</strong><br>
          {{ t('mdl_feedback_desc') }}
        </div>

        <div class="field-group">
          <label class="field-label">{{ t('mdl_feedback_lbl_input') }}</label>
          <textarea class="field-input" id="feedback-text" rows="4"
            :placeholder="t('mdl_feedback_placeholder')"
            style="resize:vertical;min-height:80px"></textarea>
        </div>

        <div class="btn-row" style="margin-top:12px">
          <button class="btn-ghost"
            onclick="document.getElementById('feedback-modal').classList.remove('active')">{{ t('btn_cancel') }}</button>
          <button class="btn-primary" onclick="submitFeedback()">{{ t('mdl_feedback_btn') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
