<template>
  <!-- â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ MODAL : AGENT â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ -->
  <div class="modal-overlay" id="agent-modal">
    <div class="modal-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_agent_title') }}</div>
        <button class="modal-close" id="close-agent-modal">{{ t('btn_close_x') }}</button>
      </div>
      <div class="modal-body">

        <!-- EXPLICATION DU CERVEAU CENTRAL -->
        <div class="info-block" style="border-left-color:var(--neon)" v-html="t('mdl_agent_desc1')">
        </div>

        <!-- ONGLETS AGENTS EXISTANTS -->
        <div id="agent-existing-list"></div>

        <div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px">
          <button class="btn-ghost" id="import-agent-btn" style="font-size:10px;padding:5px 10px">{{ t('btn_import') }}</button>
          <input type="file" id="import-agent-input" accept=".json" style="display:none">
          <button class="btn-ghost" id="generate-more-agents-btn"
            style="font-size:10px;padding:5px 10px;color:var(--neon);border-color:rgba(0,255,157,0.3)">{{ t('btn_gen_more_agents') }}</button>
        </div>
        <div class="section-title">{{ t('mdl_agent_config_new') }}</div>

        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_name') }} <span style="color:var(--danger)">*</span></label>
          <input type="text" class="field-input" id="agent-name"
            placeholder="ex. CodeArchitect, ResearchBot, BioinfoGPT…">
        </div>

        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_role') }} <span style="color:var(--danger)">*</span></label>
          <textarea class="field-textarea" id="agent-desc" rows="2"
            placeholder="Ex : Tu es un expert en bioinformatique spécialisé en génomique. Tu analyses les données scientifiques avec précision et cites tes sources."></textarea>
          <div class="field-hint">{{ t('hint_agent_desc') }}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field-group">
            <label class="field-label">{{ t('lbl_agent_tags') }}</label>
            <input type="text" class="field-input" id="agent-tags" placeholder="code, recherche, médecine">
            <div class="field-hint">{{ t('hint_agent_tags') }}</div>
          </div>
          <div class="field-group">
            <label class="field-label">{{ t('lbl_agent_model') }}</label>
            <select class="field-input field-select" id="agent-model-pref">
              <option value="">{{ t('opt_auto') }}</option>
            </select>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_instructions') }}</label>
          <textarea class="field-textarea" id="agent-instructions" rows="4"
            placeholder="Ex :&#10;- Réponds toujours en français sauf si l'utilisateur écrit en anglais&#10;- Structure tes réponses avec des sections claires&#10;- Cite systématiquement les sources et les APIs utilisées&#10;- Si la question dépasse ton domaine, dis-le clairement"></textarea>
          <div class="field-hint">{{ t('hint_agent_inst') }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">{{ t('lbl_agent_primer') }}</label>
          <textarea class="field-textarea" id="agent-primer" rows="2"
            placeholder="Ex : 'Je commence chaque analyse par une revue des publications récentes sur PubMed…'"></textarea>
          <div class="field-hint">{{ t('hint_agent_primer') }}</div>
        </div>

        <!-- ADVANCED PARAMS CREATE -->
        <div class="agent-advanced-section" style="margin-top:8px">
          <div class="agent-advanced-toggle" id="create-adv-toggle">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 9L1 3h10z" />
            </svg>
            {{ t('lbl_adv_params') }}
          </div>
          <div class="agent-advanced-body" id="create-adv-body">
            <div class="field-group" style="margin-bottom:12px">
              <label class="field-label">{{ t('lbl_temp') }}</label>
              <div class="range-group">
                <input type="range" id="create-agent-temp" min="0" max="2" step="0.05" value="0.7">
                <span class="range-value" id="create-agent-temp-val">0.7</span>
              </div>
            </div>
            <div class="field-group" style="margin-bottom:12px">
              <label class="field-label">{{ t('lbl_response_style') }}</label>
              <select class="field-input field-select" id="create-agent-style">
                <option value="">{{ t('opt_auto') }}</option>
                <option value="concis">{{ t('opt_concis') }}</option>
                <option value="detaille">{{ t('opt_detail') }}</option>
                <option value="formel">{{ t('opt_formel') }}</option>
                <option value="creatif">{{ t('opt_creatif') }}</option>
                <option value="pedagogique">{{ t('opt_pedago') }}</option>
              </select>
            </div>
            <div class="field-group" style="margin-bottom:0">
              <label class="field-label">{{ t('lbl_forbidden_inst') }}</label>
              <textarea class="field-textarea" id="create-agent-forbidden" rows="2"
                placeholder="Ex : Ne jamais donner de conseils médicaux directs."></textarea>
            </div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn-ghost" id="close-agent-modal-2">{{ t('btn_cancel') }}</button>
          <button class="btn-primary" id="save-agent">{{ t('btn_create_agent') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
