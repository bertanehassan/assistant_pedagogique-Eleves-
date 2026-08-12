<template>
  <!-- ═══════════════════ MODAL : API KEY ═══════════════════ -->
  <div class="modal-overlay" id="api-modal">
    <div class="modal-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_api_title') }}</div>
        <button class="modal-close" id="close-api-modal">{{ t('btn_close_x') }}</button>
      </div>
      <div class="modal-body">

        <!-- FORMULAIRES -->
        <div class="field-group">
          <label class="field-label">Clé API Mistral AI (Principal)</label>
          <input type="password" class="field-input" id="api-key-input" :placeholder="t('mdl_api_placeholder')">
          <div class="field-hint">{{ t('mdl_api_hint') }} <code
              style="font-family:var(--font-mono);color:var(--text-code);font-size:11px">sk-xxxxxxxxxxxxxxxxxxxxxxxx</code>
          </div>
          <div style="margin-top:6px; display:flex; align-items:center;">
            <button class="btn-ghost" id="test-mistral-api" style="font-size:11px;padding:4px 8px;border:1px solid rgba(255,255,255,0.2)">📡 Tester Mistral</button>
            <span id="test-mistral-result" style="font-size:11px;margin-left:8px;font-weight:600"></span>
          </div>
        </div>

        <div class="field-group" style="margin-top:16px">
          <label class="field-label" style="color:var(--cyan)">Clé API Google Gemini (Vision & PDF)</label>
          <input type="password" class="field-input" id="gemini-api-key-input" placeholder="Collez votre clé API Gemini AI ici...">
          <div class="field-hint">Obtenez une clé gratuite sur <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--cyan);text-decoration:underline">Google AI Studio</a>. <code
              style="font-family:var(--font-mono);color:var(--text-code);font-size:11px">AIzaSy...</code>
          </div>
          <div style="margin-top:6px; display:flex; align-items:center;">
            <button class="btn-ghost" id="test-gemini-api" style="font-size:11px;padding:4px 8px;border:1px solid rgba(0,229,255,0.3);color:var(--cyan)">📡 Tester Gemini</button>
            <span id="test-gemini-result" style="font-size:11px;margin-left:8px;font-weight:600"></span>
          </div>
        </div>

        <div class="field-group" style="margin-top:16px">
          <label class="field-label" style="color:var(--violet)">Clé API OpenRouter (DeepSeek)</label>
          <input type="password" class="field-input" id="openrouter-api-key-input" placeholder="Collez votre clé API OpenRouter ici...">
          <div class="field-hint">Obtenez une clé sur <a href="https://openrouter.ai/keys" target="_blank" style="color:var(--violet);text-decoration:underline">openrouter.ai</a>. <code
              style="font-family:var(--font-mono);color:var(--text-code);font-size:11px">sk-or-v1-...</code>
          </div>
          <div style="margin-top:6px; display:flex; align-items:center;">
            <button class="btn-ghost" id="test-openrouter-api" style="font-size:11px;padding:4px 8px;border:1px solid rgba(128,131,255,0.3);color:var(--violet)">📡 Tester OpenRouter</button>
            <span id="test-openrouter-result" style="font-size:11px;margin-left:8px;font-weight:600"></span>
          </div>
        </div>

        <div class="field-group" style="margin-top:16px">
          <label class="field-label" style="color:#f97316">🤖 Clé API xAI (Grok 4 / Grok 4.5 / Grok 3 Mini)</label>
          <input type="password" class="field-input" id="xai-api-key-input" placeholder="Collez votre clé API xAI ici...">
          <div class="field-hint">Obtenez une clé sur <a href="https://console.x.ai/" target="_blank" style="color:#f97316;text-decoration:underline">console.x.ai</a>. <code
              style="font-family:var(--font-mono);color:var(--text-code);font-size:11px">xai-...</code>
          </div>
          <div style="margin-top:6px; display:flex; align-items:center;">
            <button class="btn-ghost" id="test-xai-api" style="font-size:11px;padding:4px 8px;border:1px solid rgba(249,115,22,0.3);color:#f97316">📡 Tester xAI (Grok)</button>
            <span id="test-xai-result" style="font-size:11px;margin-left:8px;font-weight:600"></span>
          </div>
        </div>

        <div class="btn-row" style="margin-top:0;padding-top:0;border-top:none;margin-bottom:20px">
          <button class="btn-ghost" id="close-api-modal-2">{{ t('btn_cancel') }}</button>
          <button class="btn-ghost danger" id="delete-api-key"
            style="border-color:rgba(255,51,102,0.3);color:var(--danger)">{{ t('btn_delete') }}</button>
          <button class="btn-primary" id="save-api-key">{{ t('mdl_api_save') }}</button>
        </div>

        <!-- SÉPARATEUR -->
        <div class="section-title">{{ t('mdl_api_guide_title') }}</div>

        <!-- INFO TUTORIEL -->
        <div class="info-block" style="margin-top:12px">
          <strong>{{ t('mdl_api_free_title') }}</strong><br>
          {{ t('mdl_api_free_desc') }}
          <ul style="padding-left:16px;margin-top:8px;line-height:2">
            <li>{{ t('mdl_api_free_li1') }}</li>
            <li>{{ t('mdl_api_free_li2') }}</li>
            <li>{{ t('mdl_api_free_li3') }}</li>
          </ul>
          <div style="margin-top:8px;font-size:12px;color:var(--text-dim)">{{ t('mdl_api_console_info') }}</div>
        </div>

        <div class="info-block mt-3" style="border-left-color:var(--cyan); background:rgba(0,229,255,0.05)">
          <strong style="color:var(--cyan)">{{ t('mdl_api_get') }}</strong><br>
          <ol style="margin-top:8px; padding-left:20px; font-size:13px; opacity:0.9">
            <li>{{ t('mdl_api_step1') }} <a href="https://console.mistral.ai/" target="_blank"
                rel="noopener noreferrer"
                style="color:var(--cyan); text-decoration:underline">Mistral AI</a></li>
            <li>{{ t('mdl_api_step2') }}</li>
            <li v-html="t('mdl_api_step3')"></li>
          </ol>
        </div>

        <div class="success-block">
          <strong>{{ t('mdl_api_secure') }}</strong><br>
          {{ t('mdl_api_secure_desc') }}
        </div>

        <div style="margin-top:12px;font-size:12px;color:var(--text-dim);text-align:center">
          {{ t('mdl_api_doc_info') }} <a href="https://docs.mistral.ai" target="_blank"
            rel="noopener noreferrer"
            style="color:var(--cyan)">docs.mistral.ai</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
