<template>
  <!-- ═══════════════════ MODAL : GESTION DES LEÇONS ═══════════════════ -->
  <div class="modal-overlay" id="agent-lessons-modal">
    <div class="modal-box" style="max-width:600px">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_lessons_title') }}<span id="lessons-agent-name" style="color:var(--neon)"></span>
        </div>
        <button class="modal-close"
          onclick="document.getElementById('agent-lessons-modal').classList.remove('active')">✕</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
        <input type="hidden" id="manage-lessons-agent-id">

        <div class="info-block" style="margin-bottom:16px;">
          {{ t('mdl_lessons_desc') }}
        </div>

        <div id="agent-lessons-list" style="display:flex; flex-direction:column; gap:10px;">
          <!-- Dynamically populated -->
        </div>

        <div class="btn-row" style="margin-top:20px; justify-content:space-between">
          <button class="btn-ghost danger" onclick="clearAgentLessons()">{{ t('btn_clear') }}</button>
          <button class="btn-primary"
            onclick="document.getElementById('agent-lessons-modal').classList.remove('active')">{{ t('btn_close') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
