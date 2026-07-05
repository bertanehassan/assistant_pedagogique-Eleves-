<template>
  <!-- ═══════════════════ MODAL : EDIT AGENT ═══════════════════ -->
  <div class="modal-overlay" id="edit-agent-modal">
    <div class="modal-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_edit_agent_title') }}</div>
        <button class="modal-close" id="close-edit-agent-modal">{{ t('btn_close_x') }}</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="edit-agent-id">
        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_name') }} <span style="color:var(--danger)">*</span></label>
          <input type="text" class="field-input" id="edit-agent-name">
        </div>
        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_role_desc') }} <span style="color:var(--danger)">*</span></label>
          <textarea class="field-textarea" id="edit-agent-desc" rows="2"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field-group">
            <label class="field-label">{{ t('lbl_agent_tags') }}</label>
            <input type="text" class="field-input" id="edit-agent-tags" placeholder="code, recherche, santé">
          </div>
          <div class="field-group">
            <label class="field-label">{{ t('lbl_agent_model') }}</label>
            <select class="field-input field-select" id="edit-agent-model-pref">
              <option value="">{{ t('opt_auto') }}</option>
            </select>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_instructions') }}</label>
          <textarea class="field-textarea" id="edit-agent-instructions" rows="4"></textarea>
        </div>
        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_primer') }}</label>
          <textarea class="field-textarea" id="edit-agent-primer" rows="2"></textarea>
        </div>
        <!-- ADVANCED PARAMS -->
        <div class="agent-advanced-section">
          <div class="agent-advanced-toggle" id="edit-adv-toggle">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 9L1 3h10z" />
            </svg>
            {{ t('lbl_adv_params_short') }}
          </div>
          <div class="agent-advanced-body" id="edit-adv-body">
            <div class="field-group" style="margin-bottom:12px">
              <label class="field-label">{{ t('lbl_temp_creative') }}</label>
              <div class="range-group">
                <input type="range" id="edit-agent-temp" min="0" max="2" step="0.05" value="0.7">
                <span class="range-value" id="edit-agent-temp-val">0.7</span>
              </div>
              <div class="field-hint" v-html="t('hint_temp_creative')"></div>
            </div>
            <div class="field-group" style="margin-bottom:12px">
              <label class="field-label">{{ t('lbl_max_tokens') }}</label>
              <div class="range-group">
                <input type="range" id="edit-agent-maxtok" min="256" max="16000" step="256" value="4096">
                <span class="range-value" id="edit-agent-maxtok-val">4096</span>
              </div>
            </div>
            <div class="field-group" style="margin-bottom:12px">
              <label class="field-label">{{ t('lbl_response_style') }}</label>
              <select class="field-input field-select" id="edit-agent-style">
                <option value="">{{ t('opt_auto_default') }}</option>
                <option value="concis">{{ t('opt_concis') }}</option>
                <option value="detaille">{{ t('opt_detail') }}</option>
                <option value="formel">{{ t('opt_formel') }}</option>
                <option value="creatif">{{ t('opt_creatif') }}</option>
                <option value="pedagogique">{{ t('opt_pedago') }}</option>
              </select>
            </div>
            <div class="field-group" style="margin-bottom:0">
              <label class="field-label">{{ t('lbl_forbidden_inst') }}</label>
              <textarea class="field-textarea" id="edit-agent-forbidden" rows="2"
                :placeholder="t('hint_forbidden_inst')"></textarea>
            </div>
            <div class="field-group" style="margin-bottom:0; margin-top:12px">
              <label class="field-label">{{ t('lbl_mem_prio') }}</label>
              <div class="range-group">
                <input type="range" id="edit-agent-mem-prio" min="1" max="5" step="1" value="3">
                <span class="range-value" id="edit-agent-mem-prio-val">3</span>
              </div>
              <div class="field-hint" v-html="t('hint_mem_prio')"></div>
            </div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn-ghost" id="close-edit-agent-modal-2">{{ t('btn_cancel') }}</button>
          <button class="btn-ghost" id="duplicate-agent-btn"
            style="color:var(--neon);border-color:rgba(0,255,157,0.3)">{{ t('btn_duplicate') }}</button>
          <button class="btn-primary" id="save-edit-agent">{{ t('btn_save_caps') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
